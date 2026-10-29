/** Actual native Pi UI and resource reload, no provider/model turn. */
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beginAppearance, resolveAppearance, stageAppearance, type Snapshot } from "../src/pi/appearance.ts";
import { request } from "../src/herdr/protocol.ts";
import { TerminalScreen } from "../docs/evidence/fullscreen/fixtures/screen.ts";

test("appearance readiness uses positioned terminal cells without inventing whitespace", () => {
  const view = new TerminalScreen(80, 24), raw = "\x1b[14;29HRelay\x1b[14;35Hready:";
  view.write(raw); expect(raw.includes("Relay ready:")).toBe(false); expect(view.snapshot().lines.join("\n")).toContain("Relay ready:");
  view.write("\x1b[2J\x1b[14;29HRelay\x1b[14;36Hready:"); expect(view.snapshot().lines.join("\n")).not.toContain("Relay ready:");
});

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
actual("actual Pi appearance Apply/Cancel/relaunch uses native themes and preserves shell/owned cleanup", async () => {
  const source = resolve(import.meta.dir, ".."), root = mkdtempSync(join(realpathSync(tmpdir()), "lab-appearance-ui-")), home = join(root, "home"), project = join(root, "project B with spaces"), state = join(home, "state");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(project, { mode: 0o700 }); mkdirSync(state, { mode: 0o700 });
  writeFileSync(join(home, ".bashrc"), `printf ready > '${root}/shell-ready'\nPS1='SYNTHETIC_SHELL> '\n`);
  let requests = 0;
  const sink = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() { requests++; return new Response("No inference expected", { status: 500 }); } });
  writeFileSync(join(state, "route.json"), JSON.stringify({ version: 1, kind: "local", endpoint: `http://127.0.0.1:${sink.port}/v1`, model: "fixture-no-inference" }), { mode: 0o600 });
  writeFileSync(join(state, "key"), "", { mode: 0o600 });
  const actors: { child: ReturnType<typeof Bun.spawn>; raw: string; socket: string; agent: string; pi: string; view: TerminalScreen; reloads: number; bannerVisible: boolean; relayRendered: boolean; fallbackRendered: boolean }[] = [];
  const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
  const deadline = Date.now() + 45000;
  async function wait(label: string, predicate: () => boolean | Promise<boolean>, actor?: typeof actors[number], end = Math.min(deadline, Date.now() + 10000)) {
    while (!(await predicate())) {
      if (Date.now() >= end || actor && actor.child.exitCode !== null) throw new Error(`${label}; exit=${actor?.child.exitCode}; evidence=${root}; shellReady=${existsSync(join(root,"shell-ready"))}; cells=${JSON.stringify(actor?.view.snapshot().lines.join("\n").slice(-1300))}; tail=${JSON.stringify(actor?.raw.slice(-500))}`);
      await pause(25);
    }
  }
  async function screen(a: typeof actors[number]) { return String((await request(a.socket, "pane.read", { pane_id: a.pi, source: "visible", lines: 100, format: "text", strip_ansi: true })).read.text); }
  async function start(noColor: boolean, indexed = false) {
    const a = { child: undefined as any, raw: "", socket: "", agent: "", pi: "", view: new TerminalScreen(150, 48), reloads: 0, bannerVisible: false, relayRendered: false, fallbackRendered: false } as typeof actors[number];
    const startDeadline = Math.min(deadline, Date.now() + 10000);
    rmSync(join(root, "shell-ready"), { force: true });
    const decoder = new TextDecoder();
    const before = new Set(readdirSync(join(state, "runs"), { withFileTypes: true, encoding: "utf8" }).map(x => x.name));
    a.child = Bun.spawn([join(source, "lab"), "--offline", "--project", project], { cwd: project,
      env: { HOME: home, SHELL: "/bin/bash", PATH: "/usr/bin:/bin", TERM: "xterm-256color", ...(indexed ? {} : { COLORTERM: "truecolor" }), LANG: "C", LAB_WORKSPACE_STATE_ROOT: state, ...(noColor ? { NO_COLOR: "1" } : {}) },
      terminal: { cols: 150, rows: 48, data(term, data) { const text = decoder.decode(data, { stream: true }); a.raw += text; a.view.write(text);
        const cells = a.view.snapshot().lines.join("\n");
        a.relayRendered ||= cells.includes("Relay ready:"); a.fallbackRendered ||= cells.includes("Using Standard for this run");
        const banner = cells.includes("Reloaded keybindings"); if (banner && !a.bannerVisible) a.reloads++; a.bannerVisible = banner; if (text.includes("\x1b[6n")) term.write("\x1b[1;1R"); if (text.includes("\x1b]11;?")) term.write("\x1b]11;rgb:ffff/ffff/ffff\x1b\\"); } },
    }); actors.push(a);
    await wait("owned native endpoint", async () => {
      const pids: number[] = [];
      function children(pid: number) { for (const value of Bun.spawnSync([Bun.which("pgrep")!, "-P", String(pid)], { timeout: 150 }).stdout.toString().trim().split(/\s+/)) if (/^\d+$/.test(value) && pids.length < 64) { const child = Number(value); pids.push(child); children(child); } }
      children(a.child.pid);
      for (const pid of pids) {
        const fields = Bun.spawnSync([Bun.which("lsof")!, "-a", "-p", String(pid), "-U", "-Fn"], { timeout: 150, maxBuffer: 131072 }).stdout.toString();
        for (const line of fields.split("\n")) {
          const path = /^n(\/(?:private\/)?tmp\/lab-h-[A-Za-z0-9_-]+\/s\.sock)(?:\s|$)/.exec(line)?.[1];
          if (path) { const pong = await request(path, "ping", {}, Math.max(1, Math.min(150, startDeadline - Date.now()))); if (pong.type === "pong" && pong.version === "0.9.5") a.socket = path; }
        }
        if (a.socket) return true;
      }
      return false;
    }, a, startDeadline);
    await wait("owned native Pi pane", async () => {
      const workspace = (await request(a.socket, "workspace.list")).workspaces[0]; if (!workspace) return false;
      const panes = (await request(a.socket, "pane.list", { workspace_id: workspace.workspace_id })).panes;
      const pi = panes.find((pane: any) => pane.label === "Pi interactive" && pane.focused);
      if (!pi) return false; expect(panes).toHaveLength(2); a.pi = pi.pane_id; return true;
    }, a, startDeadline);
    let trusted = false;
    await wait("native client cells, Pi session and independent shell readiness", async () => {
      const text = await screen(a);
      if (!trusted && text.includes("Trust project folder?")) { trusted = true; a.child.terminal!.write("\r"); }
      return a.relayRendered && text.includes("Relay ready:") && existsSync(join(root, "shell-ready"));
    }, a, startDeadline);
    const run = readdirSync(join(state, "runs")).find(name => !before.has(name));
    if (!run) throw new Error("Owned appearance run missing");
    a.agent = join(state, "runs", run, "agent");
    return a;
  }
  async function paste(a: typeof actors[number], text: string) { a.child.terminal!.write("\x1b[200~" + text + "\x1b[201~"); await pause(300); a.child.terminal!.write("\r"); }
  async function quit(a: typeof actors[number]) {
    await paste(a, "/exit"); await wait("normal owned exit", () => a.child.exitCode !== null, a);
    expect(await a.child.exited).toBe(0);
    const attachment = JSON.parse(readFileSync(join(a.agent, "../attachment.json"), "utf8"));
    expect(attachment.cleanup).toEqual({ serverExited: true, clientExited: true, workerStopped: true, socketsRemoved: true });
  }
  mkdirSync(join(state, "runs"), { mode: 0o700 });
  const hardStop = setTimeout(() => { for (const a of actors) if (a.child.exitCode === null) a.child.kill("SIGTERM"); }, 48000);
  try {
    const a = await start(false);
    await paste(a, "/lab-appearance"); await wait("appearance staged dialog", async () => (await screen(a)).includes("LAB Appearance - staged sample"), a);
    a.child.terminal!.write("2"); await wait("native mode selector", async () => { const text = await screen(a); return text.includes("dark") && text.includes("light") && text.includes("terminal") && text.includes("navigate") && text.includes("escape/ctrl+c cancel") && !text.includes("7. Apply"); }, a);
    a.child.terminal!.write("\x1b[B"); a.child.terminal!.write("\r"); await wait("light sample", async () => (await screen(a)).includes("2. Mode: light"), a);
    const beforeReload = a.reloads; a.child.terminal!.write("7"); await wait("native reload", () => a.reloads > beforeReload, a);
    expect(JSON.parse(readFileSync(join(state, "appearance/preferences.json"), "utf8")).user.mode).toBe("light");
    expect(JSON.parse(readFileSync(join(a.agent, "settings.json"), "utf8")).theme).toBe("lab-appearance-light");
    const preferences = readFileSync(join(state, "appearance/preferences.json"), "utf8");
    await paste(a, "/lab-appearance"); await wait("cancel dialog", async () => (await screen(a)).includes("LAB Appearance - staged sample"), a); a.child.terminal!.write("8");
    await wait("cancel returns native composer", async () => !(await screen(a)).includes("LAB Appearance - staged sample"), a);
    expect(readFileSync(join(state, "appearance/preferences.json"), "utf8")).toBe(preferences);
    await quit(a);
    const b = await start(true);
    expect(JSON.parse(readFileSync(join(b.agent, "settings.json"), "utf8")).theme).toBe("lab-appearance-light");
    expect(Object.values(JSON.parse(readFileSync(join(b.agent, "themes/lab-appearance-light.json"), "utf8")).colors).every(value => value === "")).toBe(true);
    b.view.resize(40, 16); b.child.terminal!.resize(40, 16); await paste(b, "/lab-appearance"); await wait("narrow keyboard appearance", async () => (await screen(b)).includes("LAB Appearance"), b);
    expect(await screen(b)).toContain("> Focused control"); b.child.terminal!.write("\x1b");
    await wait("narrow Cancel", async () => !(await screen(b)).includes("LAB Appearance"), b);
    await quit(b);
    // Simulate preferences previously saved on a truecolor terminal. The inactive
    // light variant passes RGB contrast but fails indexed conversion.
    const stored = JSON.parse(readFileSync(join(state, "appearance/preferences.json"), "utf8"));
    const snapshot: Snapshot = { revision: "fixture", user: stored.user, project: null, scope: { kind: "user" } };
    const draft = beginAppearance(snapshot), rgb = { color: "truecolor", terminalAppearance: "unknown" } as const;
    const light = resolveAppearance(stageAppearance(draft, { ...stored.user, mode: "light" }), rgb).palette;
    const dark = resolveAppearance(stageAppearance(draft, { ...stored.user, mode: "dark" }), rgb).palette;
    stored.user = { ...stored.user, mode: "dark", palette: { kind: "custom", light: { ...light, text: "#277CA7" }, dark } };
    const custom = JSON.stringify(stored) + "\n"; writeFileSync(join(state, "appearance/preferences.json"), custom, { mode: 0o600 });
    const c = await start(false, true);
    expect(c.fallbackRendered).toBe(true); expect(readFileSync(join(state, "appearance/preferences.json"), "utf8")).toBe(custom);
    await paste(c, "/lab-appearance"); await wait("indexed repair dialog", async () => (await screen(c)).includes("LAB Appearance - staged"), c);
    c.child.terminal!.write("6"); await wait("Reset preview", async () => (await screen(c)).includes("inherited/default"), c);
    const beforeRepair = c.reloads; c.child.terminal!.write("7"); await wait("native repair reload", () => c.reloads > beforeRepair, c);
    expect(JSON.parse(readFileSync(join(state, "appearance/preferences.json"), "utf8")).user).toBeNull();
    await quit(c); expect(requests).toBe(0);
  } finally {
    clearTimeout(hardStop);
    for (const [index, a] of actors.entries()) { if (a.child.exitCode === null) { a.child.kill("SIGTERM"); await a.child.exited; } a.child.terminal!.close(); writeFileSync(join(root, `terminal-${index}.ansi`), a.raw); }
    sink.stop(true);
  }
}, 55000);
