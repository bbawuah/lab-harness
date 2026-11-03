/**
 * Operator-run live desktop acceptance against a disposable fixture window that
 * this script builds, starts, owns and stops by pid. Never lists, binds or
 * touches any other app or window: list-windows is always filtered to the
 * fixture app and the binding must match the fixture's own pid and nonce title.
 *
 * Preconditions (the operator does these, LAB never does):
 *   - run from Terminal.app, with Accessibility granted to Terminal yourself;
 *   - the pinned tool is cached (lab --setup-desktop).
 * Without Accessibility it prints the named-grantee advice and exits 2 before
 * building or starting anything.
 *
 * Usage: bun scripts/desktop-live-smoke.ts [--out FILE]
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DesktopSession } from "../src/desktop/session.ts";
import { DesktopApprovals } from "../src/desktop/approval.ts";
import { OwnedHost } from "../src/desktop/host.ts";
import { envelope, windows, type Node } from "../src/desktop/projection.ts";
import { accessibilityAdvice } from "../src/desktop/setup.ts";
import { responsibleApp } from "../src/desktop/responsible.ts";
import { desktopVersion } from "../src/desktop/runtime.ts";

const APP = "LABDesktopFixture";
const args = process.argv.slice(2);
const out = args[0] === "--out" && args[1] ? resolve(args[1]) : undefined;
const results: { step: string; ok: boolean; detail?: string }[] = [];
const record = (step: string, ok: boolean, detail?: string) => { results.push({ step, ok, ...(detail ? { detail } : {}) }); console.log(`${ok ? "✓" : "✗"} ${step}${detail ? " — " + detail : ""}`); };
const expectError = async (step: string, work: Promise<unknown>, code: string) => {
  try { await work; record(step, false, "no error"); } catch (e) { const m = e instanceof Error ? e.message : String(e); record(step, m.startsWith(code), m.slice(0, 160)); }
};
const find = (node: Node, test: (n: Node) => boolean): Node | undefined => test(node) ? node : node.children?.map(c => find(c, test)).find(Boolean);

const session = DesktopSession.create();
const host = session.transport as OwnedHost;
const fixtureRoot = mkdtempSync("/private/tmp/lab-desktop-fixture-"); chmodSync(fixtureRoot, 0o700);
let fixture: ReturnType<typeof spawn> | undefined;
let exitCode = 0;
try {
  const report = await session.permissions();
  if (report.accessibility !== "granted") {
    console.log(accessibilityAdvice(responsibleApp()).join("\n"));
    exitCode = 2;
  } else {
    // Build the disposable fixture app bundle.
    const bundle = join(fixtureRoot, `${APP}.app`), macos = join(bundle, "Contents/MacOS");
    mkdirSync(macos, { recursive: true });
    writeFileSync(join(bundle, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>${APP}</string><key>CFBundleExecutable</key><string>${APP}</string><key>CFBundleIdentifier</key><string>dev.lab-harness.desktop-fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>NSPrincipalClass</key><string>NSApplication</string></dict></plist>\n`);
    const build = spawnSync("/usr/bin/xcrun", ["swiftc", "-O", "-o", join(macos, APP), resolve(import.meta.dir, "desktop-fixture.swift")], { stdio: "inherit", timeout: 180000 });
    if (build.status !== 0) throw new Error("fixture build failed");
    const nonce = randomUUID().slice(0, 8), title = `LAB fixture ${nonce}`, savedFile = join(fixtureRoot, "saved.txt");
    fixture = spawn(join(macos, APP), [title, savedFile], { stdio: "ignore" });
    const pid = fixture.pid!;
    // Find ONLY the fixture's own window (filtered by app, then by our pid and nonce title).
    let window;
    for (let n = 0; n < 100 && !window; n++) {
      const r = await host.run(["list-windows", `--app=${APP}`]);
      const e = envelope(r.stdout, "list-windows");
      if (e.ok) window = windows(e.data).find(w => w.pid === pid && w.title === title);
      if (!window) await new Promise(r => setTimeout(r, 100));
    }
    if (!window) throw new Error("fixture window not found");
    const binding = await session.bind(window);
    record("bind own fixture window by pid and nonce title", binding.pid === pid && binding.title === title, `${binding.app} · pid matches`);

    const approvals = new DesktopApprovals();
    let call = 0;
    const act = (input: any) => session.execute(input, approvals.grant(`smoke-${++call}`, input, session.bindingKey()!) && approvals.take(`smoke-${call}`), undefined);
    const snap = async () => (await session.execute({ operation: "snapshot" }, undefined)) as { snapshotId: string; tree: Node };
    let s = await snap();
    const nameField = find(s.tree, n => n.name === "Name" && !!n.ref), secure = find(s.tree, n => n.name === "Password" && !!n.ref), save = find(s.tree, n => n.name === "Save" && !!n.ref);
    record("snapshot exposes Name, Password, Save refs", !!nameField && !!secure && !!save, s.snapshotId);
    record("secure field has no value and is marked secure", !!secure && secure.value === undefined && !!secure.states?.includes("secure"));
    await expectError("read on secure field refused", session.execute({ operation: "read", ref: secure!.ref, property: "value" }, undefined), "LAB_DESKTOP_SECURE_FIELD");
    await expectError("type into secure field refused", act({ operation: "type", ref: secure!.ref, text: "hunter2" }), "LAB_DESKTOP_SECURE_FIELD");
    await expectError("action without approval refused", session.execute({ operation: "click", ref: save!.ref }, undefined), "LAB_DESKTOP_NOT_APPROVED");
    s = await snap();
    const typed = await act({ operation: "type", ref: find(s.tree, n => n.name === "Name" && !!n.ref)!.ref, text: "Native Fixture" }) as any;
    record("type into Name", typed.action === "type", typed.delivery);
    await expectError("stale ref after an action refused", act({ operation: "click", ref: save!.ref }), "LAB_DESKTOP_STALE_REF");
    s = await snap();
    const read = await session.execute({ operation: "read", ref: find(s.tree, n => n.name === "Name" && !!n.ref)!.ref, property: "value" }, undefined) as any;
    record("read Name value back", read.value === "Native Fixture", String(read.value));
    const clicked = await act({ operation: "click", ref: find(s.tree, n => n.name === "Save" && !!n.ref)!.ref }) as any;
    record("click Save", clicked.action === "click", clicked.delivery);
    let saved = ""; for (let n = 0; n < 50 && !saved; n++) { saved = existsSync(savedFile) ? readFileSync(savedFile, "utf8") : ""; if (!saved) await new Promise(r => setTimeout(r, 100)); }
    record("fixture independently recorded the saved value", saved === "Native Fixture", saved);
    // press goes to the app's focused window, so LAB sends it only while the bound window holds focus.
    // The fixture never activates itself; record whichever branch this run exercised.
    try {
      const pressed = await act({ operation: "press", key: "tab" }) as any;
      record("press tab while the fixture window is focused", pressed.action === "press", pressed.delivery);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      record("press refused because the fixture window is not focused (nothing sent)", m.startsWith("LAB_DESKTOP_REFUSED: NOT_FOCUSED"), m.slice(0, 120));
    }
    const hostsWhileBound = host.hostPids();
    record("one owned host running while bound", hostsWhileBound.length === 1, `${hostsWhileBound.length} host(s)`);
    process.kill(pid, "SIGTERM"); fixture = undefined;
    for (let n = 0; n < 50; n++) { try { process.kill(pid, 0); await new Promise(r => setTimeout(r, 100)); } catch { break; } }
    await expectError("closed fixture window unbinds; nothing done", session.execute({ operation: "snapshot" }, undefined), "LAB_DESKTOP_UNBOUND");
    record("binding removed after window closed", session.binding() === undefined);
  }
} catch (e) {
  record("unexpected failure", false, e instanceof Error ? e.message.slice(0, 200) : String(e)); exitCode = 1;
} finally {
  if (fixture?.pid) { try { process.kill(fixture.pid, "SIGTERM"); } catch {} }
  const root = session.descriptor.root;
  try { await session.close(); record("owned hosts stopped by pid and root removed", !existsSync(root)); }
  catch (e) { record("cleanup", false, e instanceof Error ? e.message : String(e)); exitCode = 1; }
  rmSync(fixtureRoot, { recursive: true, force: true });
}
if (results.some(r => !r.ok) && exitCode === 0) exitCode = 1;
if (out) writeFileSync(out, JSON.stringify({ tool: `agent-desktop ${desktopVersion}`, date: new Date().toISOString(), results }, null, 2) + "\n");
process.exit(exitCode);
