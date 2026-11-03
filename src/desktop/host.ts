/**
 * Owned agent-desktop process state for one LAB run.
 *
 * agent-desktop forwards each CLI call to a long-lived "command host" that it
 * starts in its own process group with a 15-minute idle timeout. The host's
 * socket lives at $TMPDIR/agent-desktop-host-<uid>/<hash>.sock and its parent
 * must be an absolute private directory (pinned command_host_socket.rs). LAB
 * gives every run a short absolute 0700 root, so the socket, state root and
 * HOME are private to the run and never shared with another LAB run or with a
 * user's own agent-desktop. Cleanup stops only hosts that hold this root's
 * owner lock and run the pinned binary: kill by own pid, never by name.
 */
import { spawn, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { insist } from "./projection.ts";
import { executableOf } from "./responsible.ts";

export type RunResult = { code: number; stdout: string };
export type Transport = {
  run(args: string[], options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<RunResult>;
  stopHosts(): Promise<void>;
  remove(): void;
  exists(): boolean;
};
export type HostDescriptor = { root: string; binary: string; helper: string };

export const OUTPUT_LIMIT = 256 * 1024;
const DEFAULT_TIMEOUT = 20000;

/** Short absolute private root. /private/tmp keeps the socket path far below the 104-byte Unix limit. */
export function createHostRoot(parent = "/private/tmp"): string {
  const root = mkdtempSync(join(parent, "lab-desktop-"));
  for (const name of ["t", "h"]) mkdirSync(join(root, name), { mode: 0o700 });
  checkPrivate(root);
  return root;
}
export function checkPrivate(root: string): void {
  const s = lstatSync(root, { throwIfNoEntry: false });
  insist(!!s && s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid?.() && (s.mode & 0o077) === 0, "LAB_DESKTOP_STATE");
}

export function hostEnvironment(descriptor: HostDescriptor): Record<string, string> {
  const { root, helper } = descriptor;
  return { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: join(root, "h"), TMPDIR: join(root, "t") + "/", AGENT_DESKTOP_HOME: join(root, "h"), AGENT_DESKTOP_MACOS_HELPER_PATH: helper, NO_COLOR: "1", LANG: "en_US.UTF-8" };
}

export class OwnedHost implements Transport {
  constructor(readonly descriptor: HostDescriptor, private readonly lsof = "/usr/sbin/lsof") { checkPrivate(descriptor.root); }
  exists() { return !!lstatSync(this.descriptor.root, { throwIfNoEntry: false }); }

  run(args: string[], options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<RunResult> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(new Error("LAB_DESKTOP_CANCELLED"));
    return new Promise((done, reject) => {
      const child = spawn(this.descriptor.binary, args, { cwd: this.descriptor.root, env: hostEnvironment(this.descriptor), stdio: ["ignore", "pipe", "pipe"], detached: true });
      let output = "", count = 0, error: Error | undefined;
      // The CLI client is in its own group; the command host it may start is in another, stopped by stopHosts().
      const kill = () => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch {} };
      const cancel = () => { error ??= new Error("LAB_DESKTOP_CANCELLED"); kill(); };
      const timer = setTimeout(() => { error ??= new Error("LAB_DESKTOP_TIMEOUT"); kill(); }, options.timeoutMs ?? DEFAULT_TIMEOUT);
      signal?.addEventListener("abort", cancel, { once: true });
      child.on("error", e => { error ??= e; });
      const limit = (n: number) => { count += n; if (count > OUTPUT_LIMIT) { error ??= new Error("LAB_DESKTOP_OUTPUT_LIMIT"); kill(); return false; } return true; };
      child.stdout.on("data", c => { if (limit(c.length)) output += c.toString(); });
      child.stderr.on("data", c => { limit(c.length); });
      child.on("close", code => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); if (error) reject(error); else done({ code: code ?? 1, stdout: output }); });
    });
  }

  /** proc_pidpath reports the resolved path; compare against the resolved pinned binary. */
  private pinned(): string { try { return realpathSync(this.descriptor.binary); } catch { return this.descriptor.binary; } }
  /**
   * Pids of command hosts holding this root's owner lock. Every holder must run
   * the pinned binary: an unknown holder, or an lsof that failed, is not proof
   * that nothing is running, so it throws instead of returning a short list.
   */
  hostPids(): number[] {
    const dir = join(this.descriptor.root, "t", `agent-desktop-host-${process.getuid?.()}`);
    let names: string[] = [];
    try { names = readdirSync(dir); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("LAB_DESKTOP_CLEANUP_FAILED: owned host state could not be read; state retained, no success claimed."); }
    const pids = new Set<number>();
    for (const lock of names.filter(n => n.endsWith(".owner.lock")).map(n => join(dir, n))) {
      const out = spawnSync(this.lsof, ["-t", "--", lock], { timeout: 5000, encoding: "utf8", maxBuffer: 65536 });
      // lsof exits 1 with no output when nothing holds the file; anything else unexpected is unverified.
      if (out.error || out.signal || (out.status !== 0 && !(out.status === 1 && !out.stdout?.trim()))) throw new Error("LAB_DESKTOP_CLEANUP_FAILED: could not check owned hosts; state retained, no success claimed.");
      for (const line of (out.stdout ?? "").split("\n")) { if (!line.trim()) continue; const pid = Number(line.trim()); if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) pids.add(pid); }
    }
    const pinned = this.pinned(), held = [...pids];
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    if (held.some(pid => executableOf(pid) !== pinned && alive(pid))) throw new Error("LAB_DESKTOP_CLEANUP_FAILED: a process LAB cannot verify holds this run's desktop lock; it was not stopped. State retained, no success claimed.");
    return held.filter(alive);
  }

  async stopHosts(): Promise<void> {
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const pids = this.hostPids();
    for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch {} }
    for (let n = 0; n < 40 && pids.some(alive); n++) await new Promise(r => setTimeout(r, 50));
    for (const pid of pids.filter(alive)) { if (executableOf(pid) === this.pinned()) try { process.kill(pid, "SIGKILL"); } catch {} }
    for (let n = 0; n < 40 && pids.some(alive); n++) await new Promise(r => setTimeout(r, 50));
    if (pids.some(alive) || this.hostPids().length) throw new Error("LAB_DESKTOP_CLEANUP_FAILED: an owned desktop host is still running; state retained, no success claimed.");
  }

  remove(): void { rmSync(this.descriptor.root, { recursive: true }); }
}
