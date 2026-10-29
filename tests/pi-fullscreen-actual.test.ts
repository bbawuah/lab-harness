import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { release } from "node:os";
import { verifyPiRuntime } from "../src/runtime/pi.ts";
import pinned from "../contracts/pi-runtime.json";
import { TerminalScreen } from "../docs/evidence/fullscreen/fixtures/screen.ts";

const actual = process.env.LAB_PI_FULLSCREEN_ACTUAL === "1" ? test : test.skip;
const source = resolve(import.meta.dir, "..");
const evidence = join(source, "docs/evidence/fullscreen");
const profile = "(version 1)(allow default)(deny network*)";
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const git = (...args: string[]) => {
  const result = Bun.spawnSync(["/usr/bin/git", ...args], { cwd: source });
  if (result.exitCode !== 0) throw new Error("Git provenance unavailable");
  return result.stdout.toString().trim();
};
const must: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };

actual("actual pinned Pi fullscreen has an isolated no-model bottom composer and transcript viewport", async () => {
  const startedAt = new Date().toISOString();
  const sourceSHA = git("rev-parse", "HEAD");
  const dirtyAtStart = git("status", "--porcelain=v1", "--untracked-files=all");
  const ownedFiles = ["tests/pi-fullscreen-actual.test.ts", "docs/evidence/fullscreen/fixtures/native-display.ts", "docs/evidence/fullscreen/fixtures/screen.ts", "docs/tui/fullscreen-contract.md"];
  const sourceHashes = Object.fromEntries(ownedFiles.map(file => [file, hash(readFileSync(join(source, file)))]));
  const result: any = { schemaVersion: 1, startedAt, sourceSHA, dirtyAtStart, sourceHashes,
    baseSHA: "da5eb98041881658f9e30542b21cba2dfb63eafe", releaseSourceSHA: pinned.releaseCommit,
    environment: { platform: process.platform, osRelease: release(), arch: process.arch, bun: Bun.version, bunSHA256: hash(readFileSync(process.execPath)), standalone: true, nestedHerdr: "UNKNOWN" },
    networkDeny: { profile, status: "BLOCKED" }, scenarios: [], inputs: [], protocolReplies: [], cleanup: {},
    limitations: ["No physical terminal, IME, tmux, WSL or Windows Terminal qualification", "No clipboard operation; copy-on-select disabled", "Synthetic display appends, not provider streaming", "Screen replay captures text/cursor only, not styles or selection highlighting"] };
  let root = "", raw = "", bytesSeen = 0, sequence = 0, lastOutput = 0;
  let child: ReturnType<typeof Bun.spawn> | undefined, resolveEOF!: () => void;
  const eof = new Promise<void>(done => { resolveEOF = done; });
  let reachedEOF = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let fixtureState: any;
  let fatal: string | undefined;
  const screen = new TerminalScreen(80, 24);
  const screens: Record<string, any> = {};
  const decoder = new TextDecoder();
  const sanitize = (value: string) => {
    let text = value;
    // Equal-width substitutions preserve terminal columns and ANSI byte lengths.
    for (const path of [root, source].filter(Boolean).sort((a, b) => b.length - a.length)) text = text.replaceAll(path, "~".repeat(path.length));
    // Native narrow footers truncate paths before the complete root is present.
    return text.replace(/\/Users\/[^\s\u001b\u0007"\\]+/g, path => "~".repeat(path.length));
  };
  async function waitFor(label: string, ready: () => boolean, ms = 10000) {
    const until = Date.now() + ms;
    while (!ready()) {
      if (Date.now() >= until || child && child.exitCode !== null) throw new Error(`Timed out: ${label}; exit=${child?.exitCode}; tail=${sanitize(raw.slice(-500))}`);
      await pause(20);
    }
  }
  async function settle() {
    await pause(100);
    await waitFor("render settling", () => Date.now() - lastOutput >= 120, 3000);
  }
  function ack() {
    if (!root || !existsSync(join(root, "ack.json"))) return undefined;
    return JSON.parse(readFileSync(join(root, "ack.json"), "utf8"));
  }
  async function control(action: string, extra: object = {}) {
    const seq = ++sequence;
    writeFileSync(join(root, "control.next"), JSON.stringify({ seq, action, ...extra }));
    renameSync(join(root, "control.next"), join(root, "control.json"));
    await waitFor(`control ${seq} ${action}`, () => ack()?.seq === seq);
    fixtureState = ack();
    must(!fixtureState.fatal, JSON.stringify(fixtureState));
    return fixtureState;
  }
  async function input(label: string, text: string) {
    result.inputs.push({ label, bytes: text, outputByteOffset: bytesSeen });
    child!.terminal!.write(text); await settle();
  }
  async function capture(name: string) {
    await control("inspect"); await settle();
    const state = await control("inspect");
    const shot = { ...screen.snapshot(), draft: state.draft, handled: state.handled, messages: state.messages, outputByteOffset: bytesSeen };
    screens[name] = shot; return shot;
  }
  const markers = (shot: any): string[] => [...new Set<string>(shot.lines.join("\n").match(/TRANSCRIPT_\d{3}/g) ?? [])];
  const markerRows = (shot: any) => shot.lines.flatMap((line: string, row: number) => [...line.matchAll(/TRANSCRIPT_\d{3}/g)].map(match => [match[0], row]));
  const borders = (shot: any) => shot.lines.flatMap((line: string, row: number) => /[─━]{8}/u.test(line) ? [row] : []);
  async function scenario(name: string, body: () => Promise<object | void>) {
    try { const details = await body(); result.scenarios.push({ name, status: "PASS", ...details }); }
    catch (error) { result.scenarios.push({ name, status: "FAIL", error: sanitize(String(error)) }); }
  }
  try {
    must(process.platform === "darwin" && process.arch === "arm64", "This bounded network-deny qualification targets macOS arm64 only");
    must(Bun.version === "1.4.2", "Use verified pinned Bun 1.4.2");
    must(hash(readFileSync(process.execPath)) === "35d20dd0263e5c950194434b925454fdfa9ba6e4467da960410fa05b08a7a5b5", "Bun identity mismatch");
    const runtime = verifyPiRuntime();
    const artifact = pinned.artifacts.find(a => a.platform === process.platform && a.arch === process.arch)!;
    result.runtime = { version: runtime.version, command: ".tmp/pi/1.4.0/darwin-arm64/pi/pi", artifact, bundleVerified: true };
    // No service is started. Read libc connect/errno directly: Bun's node:net
    // compatibility layer maps this sandbox denial to ECONNREFUSED on this host.
    // Accept only the actual EPERM syscall result, never a connection refusal.
    const probe = Bun.spawnSync(["/usr/bin/sandbox-exec", "-p", profile, process.execPath, "--no-env-file", "--no-install", "-e",
      'import {dlopen,ptr,toArrayBuffer} from "bun:ffi";const {symbols:s}=dlopen("/usr/lib/libSystem.B.dylib",{socket:{args:["i32","i32","i32"],returns:"i32"},connect:{args:["i32","ptr","i32"],returns:"i32"},close:{args:["i32"],returns:"i32"},__error:{args:[],returns:"ptr"}});const fd=s.socket(2,1,0),a=new Uint8Array([16,2,0,9,127,0,0,1,0,0,0,0,0,0,0,0]);const ret=s.connect(fd,ptr(a),16);const errno=new Int32Array(toArrayBuffer(s.__error(),0,4))[0];s.close(fd);console.log(JSON.stringify({ret,errno}));process.exit(ret===-1&&errno===1?0:2);'],
      { env: { PATH: "/usr/bin:/bin", LANG: "C" }, timeout: 5000 });
    result.networkDeny = { profile, status: probe.exitCode === 0 && probe.stdout.toString().trim() === '{"ret":-1,"errno":1}' ? "PASS" : "BLOCKED", probe: "sandboxed Bun FFI libc connect syscall to loopback port 9, no listener; require -1/EPERM", exitCode: probe.exitCode, stdout: probe.stdout.toString(), stderr: probe.stderr.toString() };
    must(result.networkDeny.status === "PASS", "OS network-deny prerequisite failed; Pi was not started");
    mkdirSync(join(source, ".tmp"), { recursive: true });
    root = realpathSync(mkdtempSync(join(source, ".tmp/fullscreen-")));
    const project = join(root, "project"), home = join(root, "home"), agent = join(root, "agent");
    for (const name of [project, home, agent, join(root, "tmp"), ...["config", "cache", "data", "state"].map(n => join(root, n))]) mkdirSync(name, { mode: 0o700 });
    const fixture = join(project, "native-display.ts");
    copyFileSync(join(evidence, "fixtures/native-display.ts"), fixture);
    must(lstatSync(fixture).isFile() && !lstatSync(fixture).isSymbolicLink(), "Fixture must be regular");
    writeFileSync(join(agent, "settings.json"), JSON.stringify({ enableInstallTelemetry: false, enableAnalytics: false,
      compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off", quietStartup: true,
      fullscreenCopyOnSelect: false, fullscreenScrollbar: "hidden", showHardwareCursor: true,
      terminal: { showImages: false }, fullscreenExitOutput: "resume-hint" }));
    const env = { HOME: home, PATH: "/usr/bin:/bin", TMPDIR: join(root, "tmp"), TERM: "xterm-256color", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8",
      PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", LAB_FULLSCREEN_RUN: root,
      XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state") };
    const args = ["--tui-mode", "fullscreen", "--offline", "--no-session", "--no-tools", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--approve", "-e", fixture];
    result.launch = { argv: ["/usr/bin/sandbox-exec", "-p", profile, "[VERIFIED_PROJECT_PI]", ...args.map(v => v === fixture ? "[FIXTURE]/project/native-display.ts" : v)], cwd: "[FIXTURE]/project", env: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, sanitize(v)])), settings: JSON.parse(readFileSync(join(agent, "settings.json"), "utf8")) };
    child = Bun.spawn(["/usr/bin/sandbox-exec", "-p", profile, ...runtime.command, ...args], { cwd: project, env,
      terminal: { cols: 80, rows: 24, data(terminal, bytes) {
        bytesSeen += bytes.length; if (bytesSeen > 4_000_000) { child?.kill("SIGTERM"); return; }
        const text = decoder.decode(bytes, { stream: true }); raw += text; lastOutput = Date.now(); screen.write(text);
        const reply = (query: string, response: string) => { if (text.includes(query)) { result.protocolReplies.push({ query, response, outputByteOffset: bytesSeen }); terminal.write(response); } };
        reply("\x1b[6n", "\x1b[1;1R"); reply("\x1b]11;?", "\x1b]11;rgb:1111/1111/1111\x1b\\");
      }, exit() { reachedEOF = true; resolveEOF(); } },
    });
    watchdog = setTimeout(() => { fatal = "120-second child deadline"; child?.kill("SIGTERM"); }, 120000);
    await waitFor("isolated no-model startup", () => ack()?.ready === true && raw.includes("FIXTURE NO MODEL"));
    await settle(); fixtureState = ack();
    await scenario("no-model input guard", async () => {
      await input("synthetic handled submission", "\x1b[200~history-one\x1b[201~"); await input("submit", "\r");
      const shot = await capture("handled-input");
      must(shot.handled === 1 && fixtureState.lastInput === "history-one", "Ordinary input did not reach handled guard");
      must(shot.draft === "" && fixtureState.availableModels === 0 && fixtureState.noRoutableModel === true, "No-model/input invariant");
      return { handled: shot.handled, agentEvents: fixtureState.agentEvents, providerEvents: fixtureState.providerEvents };
    });
    await control("append", { count: 40 }); await settle();
    await input("composer draft", "\x1b[200~DRAFT_ANCHOR\x1b[201~");
    await scenario("bottom dock stable across appends", async () => {
      const before = await capture("bottom-before"); await control("append", { count: 5 }); await settle(); const after = await capture("bottom-after");
      must(before.draft === "DRAFT_ANCHOR" && after.draft === before.draft, "Draft changed");
      must(before.cursor.y === after.cursor.y && before.cursor.y >= 19 && before.cursor.y < 24, "Caret is not stable near bottom");
      must(borders(before).length >= 2 && JSON.stringify(borders(before)) === JSON.stringify(borders(after)), "Editor borders moved");
      must(markers(before).includes("TRANSCRIPT_040") && markers(after).includes("TRANSCRIPT_045"), "Following latest output not visible");
      return { beforeRows: borders(before), afterRows: borders(after), caretRow: after.cursor.y, footerRow: after.lines.findIndex((v: string) => v.includes("FIXTURE NO MODEL")) };
    });
    await scenario("PageUp and append preserve scrolled transcript", async () => {
      await input("PageUp", "\x1b[5~"); const before = await capture("scrolled-before");
      must(markers(before).length > 0 && !markers(before).includes("TRANSCRIPT_045"), "PageUp did not leave latest");
      await control("append", { count: 3 }); await settle(); const after = await capture("scrolled-after-append");
      must(JSON.stringify(markerRows(before)) === JSON.stringify(markerRows(after)), "New output forced transcript jump");
      must(before.draft === after.draft && before.cursor.y === after.cursor.y, "Scrolled draft/dock changed");
      return { visibleBefore: markers(before), visibleAfter: markers(after) };
    });
    await scenario("PageDown and Ctrl+Home/End transcript actions", async () => {
      const before = await capture("before-page-down"); await input("PageDown", "\x1b[6~"); const down = await capture("page-down");
      must(JSON.stringify(markers(before)) !== JSON.stringify(markers(down)), "PageDown did not move transcript");
      await input("Ctrl+Home", "\x1b[1;5H"); const top = await capture("transcript-top");
      must(markers(top).includes("TRANSCRIPT_001"), "Ctrl+Home did not reach start");
      await input("Ctrl+End", "\x1b[1;5F"); const end = await capture("transcript-end");
      must(markers(end).includes("TRANSCRIPT_048"), "Ctrl+End did not reach latest");
      await control("append", { count: 1 }); await settle(); const follow = await capture("follow-restored");
      must(markers(follow).includes("TRANSCRIPT_049") && follow.draft === "DRAFT_ANCHOR", "Follow-output not restored");
      return { top: markers(top), latest: markers(follow) };
    });
    const unicode = "第一行 漢字 e\u0301\nsecond line " + "wrap words ".repeat(12);
    await scenario("multiline bracketed paste CJK combining and caret", async () => {
      await input("clear draft", "\x15"); await input("Unicode bracketed paste", "\x1b[200~" + unicode + "\x1b[201~");
      const before = await capture("unicode-paste");
      must(before.draft === unicode && before.handled === 1, "Paste lost text or submitted");
      must(before.lines.join("\n").includes("漢字") && before.lines.join("\n").includes("e\u0301"), "Unicode not visible in actual cells");
      await input("caret left", "\x1b[D"); const left = await capture("caret-left");
      must(left.draft === unicode && (left.cursor.x !== before.cursor.x || left.cursor.y !== before.cursor.y), "Left did not move caret");
      await input("caret up", "\x1b[A"); const up = await capture("caret-up");
      must(up.draft === unicode && up.cursor.y < left.cursor.y, "Up did not move within multiline draft");
      return { logicalTextExact: true, beforeCursor: before.cursor, leftCursor: left.cursor, upCursor: up.cursor };
    });
    await scenario("resize wrapping 160x50 narrow 40x16 and 80x24", async () => {
      for (const [cols, rows] of [[160, 50], [40, 16], [80, 24]] as const) {
        result.inputs.push({ label: "resize", cols, rows, outputByteOffset: bytesSeen });
        const rawStart = raw.length;
        screen.resize(cols, rows); child!.terminal!.resize(cols, rows); await settle();
        const shot = await capture(`resize-${cols}x${rows}`);
        must(shot.draft === unicode && shot.cursor.y >= 0 && shot.cursor.y < rows && shot.cursor.x < cols, "Resize lost draft/caret bounds");
        must(shot.lines.some((v: string) => v.includes("FIXTURE NO MODEL")) && borders(shot).length >= 2, "Dock/footer disappeared on resize");
        must(markers(shot).length > 0, "Transcript not usable after resize");
        must(raw.slice(rawStart).includes("\x1b[2J"), "Actual terminal did not clear stale cells after resize");
      }
      return { sizes: ["160x50", "40x16", "80x24"], draftPreserved: true };
    });
    // Clear the multiline editor through the test-only submission guard before
    // history checks. No application/model processing is allowed.
    await input("submit Unicode to handled guard", "\r"); await capture("unicode-handled");
    await scenario("history arrows and editor line boundaries", async () => {
      await input("history previous", "\x1b[A"); const older = await capture("history-older");
      must(older.draft === unicode.trim(), "Up at empty boundary did not restore latest handled history (native history trims whitespace)");
      await input("Home", "\x1b[H"); const home = await capture("editor-home");
      await input("End", "\x1b[F"); const end = await capture("editor-end");
      must(home.draft === unicode.trim() && end.draft === unicode.trim() && home.cursor.x < end.cursor.x, "Home/End did not move caret within editor");
      must(JSON.stringify(markers(home)) === JSON.stringify(markers(end)), "Editor keys scrolled transcript");
      for (let i = 0; i < 8; i++) await input("Down toward newer history", "\x1b[B");
      const newer = await capture("history-newer"); must(newer.draft === "", "Down at bottom boundary did not restore newer empty draft");
      return { historyRestored: true, trailingWhitespaceTrimmedByHistory: true, home: home.cursor, end: end.cursor, newerDraft: newer.draft };
    });
    await scenario("Ctrl+J newline without submission", async () => {
      await input("clear remaining draft by handled submit", "\r"); const before = await capture("before-ctrl-j");
      await input("first line", "\x1b[200~line-one\x1b[201~"); await input("Ctrl+J", "\x0a");
      await input("second line", "\x1b[200~line-two\x1b[201~"); const after = await capture("ctrl-j");
      must(after.draft === "line-one\nline-two" && after.handled === before.handled, "Ctrl+J submitted or lost newline");
      return { logicalDraft: after.draft, noSubmission: true };
    });
    await scenario("CJK and combining grapheme caret and deletion widths", async () => {
      await input("submit previous draft to handled guard", "\r");
      await input("short Unicode draft", "\x1b[200~漢字e\u0301\x1b[201~"); const initial = await capture("grapheme-initial");
      must(initial.draft === "漢字e\u0301" && initial.cursor.x === 5, "CJK/combining cell width mismatch");
      await input("left over combining grapheme", "\x1b[D"); const left = await capture("grapheme-left");
      must(left.cursor.x === 4 && left.draft === initial.draft, "Combining grapheme split on left");
      await input("right over combining grapheme", "\x1b[C"); await input("backspace combining grapheme", "\x7f");
      const deleted = await capture("grapheme-deleted"); must(deleted.draft === "漢字" && deleted.cursor.x === 4, "Backspace split combining grapheme");
      await input("left over CJK cell", "\x1b[D"); const cjk = await capture("cjk-left");
      must(cjk.cursor.x === 2, "CJK caret did not move two columns");
      await input("insert between CJK characters", "X"); const inserted = await capture("cjk-inserted");
      must(inserted.draft === "漢X字" && inserted.cursor.x === 3, "CJK insertion corrupted draft or caret");
      return { initialColumns: initial.cursor.x, combiningLeft: left.cursor.x, afterDeletion: deleted.cursor.x, cjkLeft: cjk.cursor.x, insertedDraft: inserted.draft };
    });
    await input("return to latest before pointer cases", "\x1b[1;5F");
    await scenario("complete wheel click drag legacy and malformed sequences preserve draft", async () => {
      const before = await capture("pointer-before");
      await input("SGR wheel up", "\x1b[<64;10;5M"); const wheel = await capture("pointer-wheel");
      must(wheel.draft === before.draft, "Wheel inserted draft bytes");
      must(JSON.stringify(markerRows(before)) !== JSON.stringify(markerRows(wheel)), "Supported SGR wheel did not scroll transcript");
      await input("SGR left press drag release", "\x1b[<0;5;4M\x1b[<32;12;4M\x1b[<0;12;4m");
      const drag = await capture("pointer-drag"); must(drag.draft === before.draft, "Complete pointer event entered draft");
      await input("legacy wheel", "\x1b[M" + String.fromCharCode(96, 42, 37));
      await input("malformed SGR numeric code", "\x1b[<999;10;5M");
      const after = await capture("pointer-complete-after"); must(after.draft === before.draft, "Legacy/malformed pointer event entered draft");
      return { exactDraft: true, wheelRowsBefore: markerRows(before), wheelRowsAfter: markerRows(wheel), selectionCopy: "disabled; highlight styles not captured" };
    });
    await scenario("SGR fragmentation within 5ms preserves draft", async () => {
      const before = await capture("pointer-fast-before");
      result.inputs.push({ label: "SGR fragments", bytes: ["\x1b[<64;", "10;5M"], gapMs: 5, outputByteOffset: bytesSeen });
      child!.terminal!.write("\x1b[<64;"); await pause(5); child!.terminal!.write("10;5M"); await settle();
      const after = await capture("pointer-fast-after"); must(after.draft === before.draft, "Fast pointer fragments inserted into draft");
      return { gapMs: 5, exactDraft: true };
    });
    await scenario("SGR fragmentation delayed 250ms preserves draft", async () => {
      const before = await capture("pointer-delayed-before");
      result.inputs.push({ label: "delayed SGR fragments", bytes: ["\x1b[<64;", "10;5M"], gapMs: 250, outputByteOffset: bytesSeen });
      child!.terminal!.write("\x1b[<64;"); await pause(250); child!.terminal!.write("10;5M"); await settle();
      const after = await capture("pointer-delayed-after");
      must(after.draft === before.draft, `Delayed pointer tail entered draft: before=${JSON.stringify(before.draft)} after=${JSON.stringify(after.draft)}`);
      return { gapMs: 250, exactDraft: true };
    });
    await capture("final"); result.safety = fixtureState;
    must(fixtureState.agentEvents === 0 && fixtureState.providerEvents === 0 && fixtureState.noRoutableModel === true && fixtureState.availableModels === 0, "No-model invariant violated");
    result.parser = { unknown: [...screen.unknown], incompleteBytes: screen.snapshot().pendingBytes };
    must(screen.unknown.size === 0 && screen.snapshot().pendingBytes === 0, "Unknown VT sequences make captures inconclusive");
    await control("quit");
    const exit = await Promise.race([child.exited, pause(5000).then(() => { throw new Error("Native shutdown timed out"); })]);
    result.exitCode = exit; must(exit === 0, "Native exit failed");
  } catch (error) { fatal = sanitize(String(error)); }
  finally {
    clearTimeout(watchdog);
    if (child) {
      if (child.exitCode === null) { child.kill("SIGTERM"); await Promise.race([child.exited, pause(2000)]); }
      if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
      result.cleanup.childReaped = child.exitCode !== null; result.exitCode ??= child.exitCode;
      await Promise.race([eof, pause(2000)]); result.cleanup.ptyEOF = reachedEOF;
      result.cleanup.fixtureShutdownAcknowledged = ack()?.shutdown === true;
      child.terminal?.close(); result.cleanup.ptyClosed = true;
    }
    result.safety ??= ack();
    if (root) { rmSync(root, { recursive: true, force: true }); result.cleanup.fixtureRemoved = !existsSync(root); }
    result.completedAt = new Date().toISOString();
    if (fatal) result.fatal = fatal;
    result.status = fatal ? "BLOCKED" : result.scenarios.some((s: any) => s.status === "FAIL") ? "FAIL" : "PASS";
    result.sanitization = "Absolute fixture/source paths replaced with equal-length ASCII ~ runs, preserving columns and control bytes; synthetic text only";
    result.safety = JSON.parse(sanitize(JSON.stringify(result.safety ?? null)));
    const output: Record<string, string> = { "terminal.ansi": sanitize(raw), "screens.json": sanitize(JSON.stringify(screens, null, 2)) + "\n" };
    result.evidenceSHA256 = Object.fromEntries(Object.entries(output).map(([name, bytes]) => [name, hash(bytes)]));
    for (const [name, bytes] of Object.entries(output)) writeFileSync(join(evidence, name), bytes);
    writeFileSync(join(evidence, "run.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ status: result.status, scenarios: result.scenarios, fatal: result.fatal, cleanup: result.cleanup }, null, 2));
  }
  expect(result.status).toBe("PASS");
}, 300000);
