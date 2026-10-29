import { expect, test } from "bun:test";
import { configureAppearance, appearanceCapability, appearanceSample, type AppearanceUI, type AppearanceRequest } from "../src/pi/workspace-appearance.ts";
import { beginAppearance, stageAppearance, type Snapshot } from "../src/pi/appearance.ts";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const initial: Snapshot = { revision: "absent", user: null, project: null, scope: { kind: "user" } };
function fixture(keys: string[], selections: string[] = [], inputs: (string | undefined)[] = []) {
  const rendered: string[][] = [], notices: string[] = [], calls: AppearanceRequest[] = [];
  let reloads = 0;
  const ui: AppearanceUI = {
    async select(_title, choices) { const selected = selections.shift(); if (selected !== undefined) expect(choices).toContain(selected); return selected; },
    async input() { return inputs.shift(); }, notify(text) { notices.push(text); },
    async custom<T>(factory: Parameters<AppearanceUI["custom"]>[0]) { let value: T | undefined; const component = factory({ terminal: { rows: 16 }, requestRender() {} }, {}, {}, v => { value = v as T; }); rendered.push(component.render(40)); component.handleInput(keys.shift() ?? "\x1b"); component.invalidate(); expect(value).toBeDefined(); return value!; },
  };
  return { ui, rendered, notices, calls, reloads: () => reloads, async reload() { reloads++; }, async bridge(request: AppearanceRequest) { calls.push(structuredClone(request)); return request.action === "appearance-load" ? { ...initial, scope: request.scope === "user" ? initial.scope : { kind: "project", binding: { root: "/synthetic/project", device: 1, inode: 2 } } } : initial; } };
}
test("appearance mode preview and Cancel never save or reload", async () => {
  const f = fixture(["2", "8"], ["light"]);
  await configureAppearance(f.ui, f.bridge, appearanceCapability({ TERM: "dumb" }), () => true, f.reload);
  expect(f.calls).toEqual([{ action: "appearance-load", scope: "user" }]); expect(f.reloads()).toBe(0);
  expect(f.rendered.flat().join("\n")).toContain("light"); expect(f.rendered.flat().join("\n")).not.toContain("\x1b");
  expect(f.rendered.flat().every(line => line.length <= 40)).toBe(true);
});
test("Apply stages native mode and spacing, saves once, then reloads", async () => {
  const f = fixture(["2", "4", "5", "7"], ["light", "3", "0"]);
  await configureAppearance(f.ui, f.bridge, appearanceCapability({ COLORTERM: "truecolor" }), () => true, f.reload);
  expect(f.calls).toHaveLength(2); expect(f.calls[1]).toMatchObject({ action: "appearance-apply", draft: { value: { mode: "light", editorPaddingX: 3, outputPad: 0 } } });
  expect(f.reloads()).toBe(1);
});
test("project scope and Reset preserve explicit operator scope and inheritance", async () => {
  const f = fixture(["1", "2", "6", "7"], ["This project only", "dark"]);
  await configureAppearance(f.ui, f.bridge, appearanceCapability({}), () => true, f.reload);
  expect(f.calls[1]).toEqual({ action: "appearance-load", scope: "project" });
  expect(f.calls[2]).toMatchObject({ action: "appearance-apply", draft: { base: { scope: { kind: "project" } }, value: null } });
});
test("invalid color leaves draft intact; busy workspace never starts configuration", async () => {
  const f = fixture(["3", "8"], ["Custom semantic color", "light", "text"], ["#FFFFFF"]);
  await configureAppearance(f.ui, f.bridge, appearanceCapability({ NO_COLOR: "" }), () => true, f.reload);
  expect(f.notices.join("\n")).toContain("contrast"); expect(f.calls).toHaveLength(1);
  const busy = fixture([]); await configureAppearance(busy.ui, busy.bridge, appearanceCapability({}), () => false, busy.reload);
  expect(busy.calls).toHaveLength(0); expect(busy.notices[0]).toContain("active model turn");
  const sample = appearanceSample(beginAppearance(initial), appearanceCapability({ NO_COLOR: "1" }), 20);
  expect(sample.join("\n")).not.toContain("\x1b"); expect(sample.every(line => line.length <= 20)).toBe(true);
});
test("appearance bridge failures expose only a canonical recovery code", async () => {
  const f = fixture([]);
  await configureAppearance(f.ui, async () => { throw new Error("vendor private path or sentinel"); }, appearanceCapability({}), () => true, f.reload);
  expect(f.notices[0]).toContain("LAB_APPEARANCE_REFUSED"); expect(f.notices[0]).not.toContain("sentinel");
});
test("real private store isolates generated themes per run and project, preserves native appearance migration", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lab-appearance-integration-"))), home = join(root, "home"), state = join(home, "state");
  mkdirSync(join(state, "runs"), { recursive: true, mode: 0o700 });
  const source = resolve(import.meta.dir, "..");
  try {
    const script = `import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs'; import {join} from 'node:path';
import {bindProjectRoot} from ${JSON.stringify(join(source, "src/project.ts"))};
import {loadAppearance,beginAppearance,stageAppearance} from ${JSON.stringify(join(source, "src/pi/appearance.ts"))};
import {prepareWorkspaceAppearance,saveWorkspaceAppearance,nativeAppearanceSettings} from ${JSON.stringify(join(source, "src/pi/workspace-appearance-store.ts"))};
const stateRoot=${JSON.stringify(state)}, installRoot=${JSON.stringify(source)}, capability={color:'truecolor',terminalAppearance:'unknown'};
const paths=['project A','project B'].map(n=>join(process.env.HOME,n));for(const p of paths)mkdirSync(p,{mode:0o700});
const project=bindProjectRoot(paths[0]); const other=bindProjectRoot(paths[1]);
const a={stateRoot,installRoot,project,capability,agentRoot:join(stateRoot,'runs/a/agent')}; const b={...a,project:other,agentRoot:join(stateRoot,'runs/b/agent')};
const user=loadAppearance({...a,scope:{kind:'user'}}); const draft=stageAppearance(beginAppearance(user),{mode:'light',palette:{kind:'preset',name:'standard'},editorPaddingX:2,outputPad:0});
saveWorkspaceAppearance({...a,draft}); const settingsA=readFileSync(join(a.agentRoot,'settings.json'),'utf8'); const themeA=readFileSync(join(a.agentRoot,'themes/lab-appearance-light.json'),'utf8');
const projectSnapshot=loadAppearance({...b,scope:{kind:'project',binding:other}});
saveWorkspaceAppearance({...b,draft:stageAppearance(beginAppearance(projectSnapshot),{...draft.value,mode:'dark'})});
if(readFileSync(join(a.agentRoot,'settings.json'),'utf8')!==settingsA || readFileSync(join(a.agentRoot,'themes/lab-appearance-light.json'),'utf8')!==themeA)throw Error('cross-run overwrite');
if(JSON.parse(settingsA).theme!=='lab-appearance-light' || JSON.parse(readFileSync(join(b.agentRoot,'settings.json'),'utf8')).theme!=='lab-appearance-dark')throw Error('wrong scoped theme');
const c={...a,agentRoot:join(stateRoot,'runs/c/agent'),capability:{color:'none',terminalAppearance:'unknown'}};const prepared=prepareWorkspaceAppearance(c); if(Object.values(JSON.parse(readFileSync(prepared.themes[0],'utf8')).colors).some(v=>v!==''))throw Error('monochrome artifacts');
let rejected=false;try{saveWorkspaceAppearance({...a,agentRoot:join(stateRoot,'outside-run'),draft:beginAppearance(loadAppearance({...a,scope:{kind:'user'}}))})}catch{rejected=true}if(!rejected)throw Error('invalid agent accepted');
const legacy=join(stateRoot,'historical');mkdirSync(legacy,{mode:0o700});writeFileSync(join(legacy,'settings.json'),JSON.stringify({theme:'light',editorPaddingX:3,outputPad:0,unrelated:'ignored'}),{mode:0o600});if(JSON.stringify(nativeAppearanceSettings(legacy))!==JSON.stringify({theme:'light',editorPaddingX:3,outputPad:0}))throw Error('native appearance migration');
console.log('SCOPED_STORE_OK');`;
    const result = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", "--eval", script], { env: { HOME: home, PATH: "/usr/bin:/bin" }, timeout: 10000 });
    expect(result.stderr.toString()).toBe(""); expect(result.stdout.toString()).toContain("SCOPED_STORE_OK"); expect(result.exitCode).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
