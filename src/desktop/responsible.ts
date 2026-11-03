/**
 * Who macOS asks about: the Accessibility (TCC) grant is checked against the
 * *responsible* process of whatever spawns agent-desktop, usually the terminal
 * app that started LAB. Both pinned executables are ad-hoc signed, so naming
 * the helper binary is not enough. This reads the answer from the kernel via
 * the exported libSystem SPI; it never touches TCC and never prompts.
 */
import { spawnSync } from "node:child_process";

export type ResponsibleApp = { pid: number; executable: string; bundle?: string; name: string; bundleId?: string };
type Native = { responsible(pid: number): number; path(pid: number): string | undefined };

let native: Native | null | undefined;
function load(): Native | null {
  if (native !== undefined) return native;
  native = null;
  if (process.platform !== "darwin") return native;
  try {
    const { dlopen, FFIType, ptr } = require("bun:ffi") as typeof import("bun:ffi");
    const lib = dlopen("/usr/lib/libSystem.B.dylib", {
      responsibility_get_pid_responsible_for_pid: { args: [FFIType.i32], returns: FFIType.i32 },
      proc_pidpath: { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    });
    native = {
      responsible: pid => lib.symbols.responsibility_get_pid_responsible_for_pid(pid),
      path(pid) { const buffer = new Uint8Array(4096); const n = lib.symbols.proc_pidpath(pid, ptr(buffer), buffer.length); return n > 0 ? new TextDecoder().decode(buffer.subarray(0, n)) : undefined; },
    };
  } catch { native = null; }
  return native;
}

/** Outermost `.app` bundle that contains the executable, e.g. Terminal.app for .../Terminal.app/Contents/MacOS/Terminal. */
export function bundleOf(executable: string): string | undefined {
  const match = /^(.*?\.app)\/Contents\//.exec(executable);
  return match?.[1];
}

export function bundleInfo(bundle: string): { name?: string; bundleId?: string } {
  try {
    const plist = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", bundle + "/Contents/Info.plist"], { timeout: 2000, maxBuffer: 1 << 20, encoding: "utf8" });
    if (plist.status !== 0) return {};
    const info = JSON.parse(plist.stdout) as Record<string, unknown>;
    const text = (key: string) => typeof info[key] === "string" && (info[key] as string).length <= 200 ? info[key] as string : undefined;
    return { name: text("CFBundleDisplayName") ?? text("CFBundleName"), bundleId: text("CFBundleIdentifier") };
  } catch { return {}; }
}

export function describeExecutable(pid: number, executable: string): ResponsibleApp {
  const bundle = bundleOf(executable);
  if (!bundle) return { pid, executable, name: executable.split("/").pop() || executable };
  const info = bundleInfo(bundle);
  return { pid, executable, bundle, name: info.name ?? bundle.split("/").pop()!.replace(/\.app$/, ""), bundleId: info.bundleId };
}

/** The process macOS will hold responsible for a child spawned by `pid` (default: this process). */
export function responsibleApp(pid = process.pid, override: Native | null = load()): ResponsibleApp | undefined {
  if (!override) return undefined;
  try {
    const responsible = override.responsible(pid);
    if (!Number.isInteger(responsible) || responsible <= 0) return undefined;
    const executable = override.path(responsible);
    return executable ? describeExecutable(responsible, executable) : undefined;
  } catch { return undefined; }
}

/** The executable path of a running pid, for window-owner verification. */
export function executableOf(pid: number, override: Native | null = load()): string | undefined {
  try { return override?.path(pid); } catch { return undefined; }
}

/**
 * Who receives the grant, and what else it covers. A grantee that is not an app
 * bundle (Homebrew bun, node, sh, a bare CLI) is a generic runtime: granting it
 * would let every script on the Mac control apps, so LAB advises against it.
 */
export function grantSubject(app: ResponsibleApp | undefined): { who: string; detail: string; reach: string; recommended: boolean } {
  if (!app) return { who: "the app that started LAB (for example Terminal or iTerm2)", detail: "LAB could not determine it on this Mac.", reach: "every program started from that app", recommended: true };
  if (app.bundle) return { who: app.name, detail: `${app.bundle}${app.bundleId ? " (" + app.bundleId + ")" : ""}`, reach: `every program started from ${app.name}`, recommended: true };
  return { who: app.executable, detail: "a generic command-line runtime, not an app", reach: "every script and program this runtime runs anywhere on this Mac", recommended: false };
}
