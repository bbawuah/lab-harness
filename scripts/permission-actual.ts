/**
 * Actual pty evidence for permission modes (docs/permission-modes-contract.md).
 * Runs the real ./lab (pinned Pi + Herdr) in owned pseudo-terminals against an
 * owned 127.0.0.1 protocol fixture: scripted tool calls, NO model inference, no
 * provider, no auth. Operator answers are typed into the native approval prompt.
 * Usage: bun --no-env-file --no-install scripts/permission-actual.ts [OUT_DIR]
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { request } from "../src/herdr/protocol.ts";
import { privateDirectory } from "../src/pi/workspace-config.ts";

const source = resolve(import.meta.dir, "..");
const out = resolve(process.argv[2] ?? join(source, ".tmp", "permission-actual-" + process.pid));
mkdirSync(out, { recursive: true, mode: 0o700 });
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

// --- owned fixture project and private LAB state ---------------------------
const base = join(homedir(), ".local/share/lab-harness/experiments"); privateDirectory(base);
const state = mkdtempSync(join(base, "permission-actual-"));
// Short owned path so narrow captures never wrap or truncate it (sanitized below).
const project = realpathSync(mkdtempSync("/tmp/lab-perm-"));
writeFileSync(join(project, "notes.txt"), "status: draft\n");

// --- owned protocol fixture: scripted tool calls per scenario ---------------
type Call = { name: string; args: Record<string, unknown> };
const scenarios: Record<string, (refs: Record<string, { name: string; role: string }>) => Call[]> = {
  S1: () => [{ name: "edit", args: { path: "notes.txt", edits: [{ oldText: "status: draft", newText: "status: reviewed" }] } }],
  S2: () => [{ name: "bash", args: { command: "echo pwned > denied.txt && git commit -am 'fixture'" } }],
  S3: refs => {
    const ref = (name: string) => "@" + (Object.keys(refs).find(k => refs[k]!.name === name) ?? "e0");
    // A fill invalidates refs, so the fixture re-snapshots before the second fill.
    return [{ name: "lab_browser", args: { operation: "snapshot" } }, { name: "lab_browser", args: { operation: "fill", ref: ref("Password"), text: "hunter2-fixture" } },
      { name: "lab_browser", args: { operation: "snapshot" } }, { name: "lab_browser", args: { operation: "fill", ref: ref("Email"), text: "ada@example.test" } }];
  },
  S4: () => [{ name: "edit", args: { path: "notes.txt", edits: [{ oldText: "status: reviewed", newText: "status: approved" }] } }, { name: "bash", args: { command: "rm -rf build" } }],
  S5: () => [{ name: "write", args: { path: "readonly.txt", content: "should not exist\n" } }],
  S6: () => [{ name: "edit", args: { path: "notes.txt", edits: [{ oldText: "status: approved", newText: "status: auto" }] } }, { name: "bash", args: { command: "echo auto > auto.txt" } }],
  S7: () => [{ name: "bash", args: { command: "printf '\x1b[2J\x1b]0;pwned\x07' # ‮exe.txt 日本語🙂 " + "x".repeat(90) } }],
};
const modelLog: { scenario: string; request: number; toolResults: string[] }[] = [];
let requests = 0;
const page = `<!doctype html><title>Permission fixture</title><h1>Sign in fixture</h1><label>Email <input type="email"></label><label>Password <input type="password"></label><button>Save</button>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(incoming) {
  if (incoming.method === "GET") return new Response(page, { headers: { "content-type": "text/html" } });
  if (new URL(incoming.url).pathname !== "/v1/chat/completions" || ++requests > 60) return new Response("fixture cap", { status: 429 });
  const body = await incoming.json() as any, messages: any[] = body.messages ?? [];
  const lastUser = messages.map((m, i) => [m, i] as const).filter(([m]) => m.role === "user").at(-1);
  const prompt = typeof lastUser?.[0].content === "string" ? lastUser[0].content : JSON.stringify(lastUser?.[0].content ?? "");
  const scenario = /\b(S\d)\b/.exec(prompt)?.[1] ?? "none";
  const results = messages.slice((lastUser?.[1] ?? 0) + 1).filter(m => m.role === "tool").map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content));
  modelLog.push({ scenario, request: requests, toolResults: results.map(r => r.slice(0, 300)) });
  let refs: Record<string, { name: string; role: string }> = {};
  for (const r of results) { try { const parsed = JSON.parse(r); if (parsed?.result?.refs) refs = parsed.result.refs; } catch {} }
  const plan = scenarios[scenario]?.(refs) ?? [], next = plan[results.length];
  const chunk = (delta: unknown, finish: string | null, usage?: unknown) => "data: " + JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "permission-fixture", choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) }) + "\n\n";
  const summary = results.map((r, i) => `#${i + 1} ${/LAB_PERMISSION_(DENIED|REFUSED)/.exec(r)?.[0] ?? "ok"}`).join(" ");
  const delta = next ? { role: "assistant", tool_calls: [{ index: 0, id: `fx_${requests}`, type: "function", function: { name: next.name, arguments: JSON.stringify(next.args) } }] }
    : { role: "assistant", content: `FIXTURE ${scenario} done; tool results seen by the fixture: ${summary || "none"}. Not a model response.` };
  return new Response(chunk(delta, null) + chunk({}, next ? "tool_calls" : "stop", { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 }) + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
} });
const origin = `http://127.0.0.1:${server.port}`;
writeFileSync(join(state, "route.json"), JSON.stringify({ version: 1, kind: "local", endpoint: origin + "/v1", model: "permission-fixture" }), { mode: 0o600 });
writeFileSync(join(state, "key"), "", { mode: 0o600 });

const projectName = basename(project), projectShort = project.replace(/^\/private/, "");
const sanitize = (text: string) => text.replaceAll(project, "$PROJECT").replaceAll(projectShort, "$PROJECT").replaceAll(state, "$STATE").replaceAll(homedir(), "$HOME").replaceAll(projectName, "PROJECT").replaceAll(String(server.port), "PORT");
// Any absolute host path left after sanitizing fails the run instead of being published.
const leaks = (text: string) => /\/private\/|\/var\/folders|\/Users\/|\/tmp\//.test(text);
const captures: Record<string, string> = {};
const checks: Record<string, boolean> = {};

async function launch(label: string, args: string[], cols: number, rows: number, drive: (io: { send(text: string): Promise<void>; type(text: string): Promise<void>; key(k: string): Promise<void>; wait(text: string, ms?: number): Promise<string>; screen(): Promise<string>; capture(name: string): Promise<string> }) => Promise<void>) {
  const before = new Set(existsSync(join(state, "runs")) ? readdirSync(join(state, "runs")) : []);
  let raw = "";
  const child = Bun.spawn([join(source, "lab"), "--offline", "--single-pane", "--project", project, ...args], {
    env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: homedir(), TERM: "xterm-256color", LANG: "en_US.UTF-8", SHELL: "/bin/sh", LAB_WORKSPACE_STATE_ROOT: state },
    terminal: { cols, rows, data(terminal, bytes) { const text = new TextDecoder().decode(bytes); raw += text; if (text.includes("\x1b[6n")) terminal.write("\x1b[1;1R"); if (text.includes("\x1b]11;?")) terminal.write("\x1b]11;rgb:1111/1111/1111\x1b\\"); } },
  });
  const killTimer = setTimeout(() => child.kill("SIGTERM"), 180000);
  try {
    let socket = "", run = "";
    for (let n = 0; n < 300 && !socket; n++) {
      const runs = existsSync(join(state, "runs")) ? readdirSync(join(state, "runs")).filter(r => !before.has(r)) : [];
      if (runs[0]) { run = join(state, "runs", runs[0]); const logs = Array.from(new Bun.Glob("cfg/herdr/sessions/*/herdr-server.log").scanSync({ cwd: run })); if (logs[0]) socket = /api server listening path=(\S+)/.exec(readFileSync(join(run, logs[0]), "utf8"))?.[1] ?? ""; }
      if (raw.includes("Trust project folder?")) { child.terminal!.write("\r"); raw = raw.replace("Trust project folder?", ""); }
      await pause(100);
    }
    if (!socket) throw new Error(label + ": owned Herdr socket not found");
    const pane = "w1:p2";
    const screen = async () => (await request(socket, "pane.read", { pane_id: pane, source: "visible", lines: rows, format: "text", strip_ansi: true })).read.text as string;
    const wait = async (text: string, ms = 20000) => { const until = Date.now() + ms; for (;;) { const s = await screen().catch(() => ""); if (s.includes(text)) return s; if (Date.now() > until) throw new Error(`${label}: missing "${text}"\n` + sanitize(s).slice(-3000)); await pause(100); } };
    const type = async (text: string) => { await request(socket, "pane.send_text", { pane_id: pane, text }); await pause(150); };
    const key = async (k: string) => { await request(socket, "pane.send_keys", { pane_id: pane, keys: [k] }); await pause(200); };
    const send = async (text: string) => { await type(text); await key("enter"); };
    const capture = async (name: string) => { const s = sanitize(await screen()); captures[name] = s; writeFileSync(join(out, name + ".txt"), s); return s; };
    await wait("Relay ready", 60000);
    await drive({ send, type, key, wait, screen, capture });
    await send("/exit");
    const code = await child.exited; checks[label + ":exit0"] = code === 0;
    const permissionFile = join(run, "permission-mode.json");
    checks[label + ":modeFileOutsideProject"] = !permissionFile.startsWith(project + "/");
  } finally { clearTimeout(killTimer); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; } child.terminal?.close(); writeFileSync(join(out, label + ".ansi"), sanitize(raw)); }
}

let failure: unknown;
try {
  // Launch A: default ask mode, 120 columns, owned browser on the fixture origin.
  await launch("ask", ["--browser", origin + "/"], 120, 44, async io => {
    await io.wait("mode: ask");
    await io.send("S1 edit the notes file");
    await io.wait("Allow once"); await io.capture("01-ask-edit-prompt");
    await io.key("enter"); // Allow once
    await io.wait("FIXTURE S1 done"); await io.capture("02-ask-edit-allowed");
    checks.editApplied = readFileSync(join(project, "notes.txt"), "utf8") === "status: reviewed\n";
    await io.send("S2 run the commit");
    await io.wait("Allow once"); await io.capture("03-ask-bash-prompt");
    await io.type("j"); await io.type("j"); await io.key("enter"); // Deny
    await io.wait("FIXTURE S2 done"); await io.capture("04-ask-bash-denied");
    checks.bashNotRun = !existsSync(join(project, "denied.txt"));
    checks.modelReceivedDenial = modelLog.some(m => m.scenario === "S2" && m.toolResults.some(r => r.includes("LAB_PERMISSION_DENIED: bash was not run (the user denied it)")));
    await io.send("S3 sign in on the page");
    await io.wait("Allow once"); await io.capture("05-browser-fill-password-prompt");
    await io.key("enter");
    await io.wait("ada@example.test"); await io.capture("06-browser-fill-email-prompt");
    await io.key("enter");
    await io.wait("FIXTURE S3 done"); await io.capture("07-browser-rows");
    checks.browserSnapshotNotPrompted = modelLog.filter(m => m.scenario === "S3").length === 5;
    checks.browserFillsSucceeded = modelLog.filter(m => m.scenario === "S3").every(m => m.toolResults.every(r => !r.includes("LAB_BROWSER")));
    await io.send("/lab-mode edits"); await io.wait("mode: edits");
    await io.send("S4 approve and clean");
    await io.wait("Allow once"); await io.capture("08-edits-mode-bash-still-asks");
    await io.key("escape"); // Esc denies
    await io.wait("FIXTURE S4 done"); await io.capture("09-edits-mode-result");
    checks.editsAutoApprovedInProjectEdit = readFileSync(join(project, "notes.txt"), "utf8") === "status: approved\n";
    checks.escDenied = modelLog.some(m => m.scenario === "S4" && m.toolResults.some(r => r.includes("LAB_PERMISSION_DENIED: bash was not run (the approval was dismissed)")));
    await io.send("/lab-mode read-only"); await io.wait("mode: read-only");
    await io.send("S5 write a file");
    await io.wait("FIXTURE S5 done"); await io.capture("10-read-only-refusal");
    checks.readOnlyRefused = !existsSync(join(project, "readonly.txt")) && modelLog.some(m => m.scenario === "S5" && m.toolResults.some(r => r.includes("LAB_PERMISSION_REFUSED")));
    await io.send("/reload"); await io.wait("mode: read-only"); await io.capture("11-mode-survives-reload");
  });
  // Launch B: explicit auto, 80 columns.
  await launch("auto", ["--mode", "auto"], 80, 30, async io => {
    await io.wait("mode: auto");
    await io.send("S6 do it all");
    await io.wait("FIXTURE S6 done"); await io.capture("12-auto-mode");
    checks.autoRanWithoutPrompts = readFileSync(join(project, "notes.txt"), "utf8") === "status: auto\n" && existsSync(join(project, "auto.txt"));
  });
  // Launch C: 40 columns, hostile command text, deny with note.
  await launch("narrow", [], 40, 40, async io => {
    await io.wait("mode: ask");
    await io.send("S7 hostile");
    await io.wait("Allow once"); await io.capture("13-narrow-hostile-bash-prompt");
    await io.type("j"); await io.type("j"); await io.type("j"); await io.key("enter");
    await io.wait("Note for the model"); await io.send("use the test script instead");
    await io.wait("FIXTURE S7 done"); await io.capture("14-narrow-deny-with-note");
    checks.noteReachedModel = modelLog.some(m => m.scenario === "S7" && m.toolResults.some(r => r.includes("User note: use the test script instead")));
  });
} catch (error) { failure = error; } finally { server.stop(true); }
checks.noHostPathsInCaptures = readdirSync(out).filter(f => /\.(txt|ansi)$/.test(f)).every(f => !leaks(readFileSync(join(out, f), "utf8")));

const ok = !failure && Object.values(checks).every(Boolean) && Object.keys(checks).length >= 17;
const git = (args: string[]) => Bun.spawnSync(["git", ...args], { cwd: source }).stdout.toString().trim();
const files = Object.fromEntries(readdirSync(out).filter(f => f.endsWith(".txt")).sort().map(f => [f, createHash("sha256").update(readFileSync(join(out, f))).digest("hex")]));
writeFileSync(join(out, "result.json"), JSON.stringify({
  kind: "actual ./lab (pinned Pi 1.4.0 + Herdr) in owned pseudo-terminals; owned 127.0.0.1 scripted protocol fixture; no model inference, provider or auth",
  ok, failure: failure ? sanitize(String(failure)).slice(0, 4000) : undefined, captureCommit: git(["rev-parse", "HEAD"]), dirty: !!git(["status", "--porcelain"]),
  platform: `${process.platform}-${process.arch}`, fixtureRequests: requests, checks, modelLog: modelLog.map(m => ({ ...m, toolResults: m.toolResults.map(sanitize) })), files,
}, null, 2) + "\n");
console.log(JSON.stringify({ ok, out: out.replace(source, "<WORKTREE>"), checks, failure: failure ? String(failure).slice(0, 600) : undefined }, null, 2));
if (ok) { rmSync(state, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
else { console.error("State retained for inspection:", state, project); process.exitCode = 1; }
