import { expect, test } from "bun:test";
import { configureAppearance, appearanceCapability, appearanceSample, type AppearanceUI, type AppearanceRequest } from "../src/pi/workspace-appearance.ts";
import { beginAppearance, stageAppearance, resolveAppearance, type Snapshot } from "../src/pi/appearance.ts";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const initial: Snapshot = { revision: "absent", user: null, project: null, scope: { kind: "user" } };
function fixture(keys: string[], selections: string[] = [], inputs: (string | undefined)[] = [], size = { rows: 32, width: 80 }) {
  const rendered: string[][] = [], notices: string[] = [], titles: string[] = [], calls: AppearanceRequest[] = [];
  let reloads = 0;
  const ui: AppearanceUI = {
    async select(_title, choices) { titles.push(_title); const selected = selections.shift(); if (selected !== undefined) expect(choices).toContain(selected); return selected; },
    async input() { return inputs.shift(); }, notify(text) { notices.push(text); },
    async custom<T>(factory: Parameters<AppearanceUI["custom"]>[0]) { let value: T | undefined; const component = factory({ terminal: { rows: size.rows }, requestRender() {} }, {}, {}, v => { value = v as T; }); rendered.push(component.render(size.width)); component.handleInput(keys.shift() ?? "\x1b"); component.invalidate(); expect(value).toBeDefined(); return value!; },
  };
  return { ui, rendered, notices, titles, calls, reloads: () => reloads, async reload() { reloads++; }, async bridge(request: AppearanceRequest) { calls.push(structuredClone(request)); return request.action === "appearance-load" ? { ...initial, scope: request.scope === "user" ? initial.scope : { kind: "project", binding: { root: "/synthetic/project", device: 1, inode: 2 } } } : initial; } };
}
test("appearance mode preview and Cancel never save or reload", async () => {
  const f = fixture(["2", "8"], ["light"]);
  await configureAppearance(f.ui, f.bridge, appearanceCapability({ TERM: "dumb" }), () => true, f.reload);
  expect(f.calls).toEqual([{ action: "appearance-load", scope: "user" }]); expect(f.reloads()).toBe(0);
  expect(f.rendered.flat().join("\n")).toContain("light"); expect(f.rendered.flat().join("\n")).not.toContain("\x1b");
  expect(f.rendered.flat().every(line => line.length <= 80)).toBe(true);
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
test("Apply surfaces a concurrently changed project palette before reload", async () => {
  for (const choice of ["Reload with temporary Standard", "Keep current view"]) {
    const f = fixture(["7"], [choice]);
    const bridge = async (request: AppearanceRequest) => request.action === "appearance-load" ? initial : {snapshot:initial,warning:"Project colors need temporary Standard in 256 colors; saved palette unchanged."};
    await configureAppearance(f.ui, bridge, {color:"256",terminalAppearance:"unknown"}, () => true, f.reload);
    expect(f.titles.join("\n")).toContain("saved palette unchanged");expect(f.reloads()).toBe(choice === "Reload with temporary Standard" ? 1 : 0);
  }
});
test("indexed palette recovery keeps the dialog open for Reset without saving rejected colors", async () => {
  const palette = { kind: "custom" as const, light: resolveAppearance(stageAppearance(beginAppearance(initial), { mode: "light", palette: {kind:"preset",name:"standard"}, editorPaddingX:1, outputPad:1 }), {color:"truecolor",terminalAppearance:"unknown"}).palette, dark: resolveAppearance(beginAppearance(initial), {color:"truecolor",terminalAppearance:"unknown"}).palette };
  palette.light.text = "#277CA7";
  const bad: Snapshot = {...initial,user:{mode:"dark",palette,editorPaddingX:1,outputPad:1}};
  const f = fixture(["7", "6", "7"]);
  f.bridge = async request => { f.calls.push(structuredClone(request)); if(request.action === "appearance-load") return bad; if(request.draft.value !== null) throw new Error("LAB_APPEARANCE_BAD_CONTRAST"); return initial; };
  await configureAppearance(f.ui, f.bridge, {color:"256",terminalAppearance:"unknown"}, () => true, f.reload);
  expect(f.notices.join("\n")).toContain("Standard");expect(f.notices.join("\n")).toContain("nothing was saved");
  expect(f.calls.at(-1)).toMatchObject({action:"appearance-apply",draft:{value:null}});expect(f.reloads()).toBe(1);
});
test("compact dialog retains sample and native cancel binding", async () => {
  const f = fixture(["8"], [], [], { rows: 16, width: 20 });
  await configureAppearance(f.ui, f.bridge, appearanceCapability({ NO_COLOR: "1" }), () => true, f.reload);
  expect(f.rendered[0]?.join("\n")).toContain("> Focused control"); expect(f.rendered[0]?.length).toBeLessThanOrEqual(5);
  let seen = false; f.ui.custom = async function<T>(factory: Parameters<AppearanceUI["custom"]>[0]) { let value: T | undefined; const c = factory({terminal:{rows:24},requestRender(){}},{},{matches(data, action){seen = action === "tui.select.cancel";return data === "native-escape" && seen;}}, v=>{value=v as T;});c.handleInput("native-escape");return value!; };
  await configureAppearance(f.ui, f.bridge, appearanceCapability({}), () => true, f.reload);expect(seen).toBe(true);expect(f.reloads()).toBe(0);
});
test("real private store isolates generated themes per run and project, preserves native appearance migration", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lab-appearance-integration-"))), home = join(root, "home"), state = join(home, "state");
  mkdirSync(join(state, "runs"), { recursive: true, mode: 0o700 });
  const source = resolve(import.meta.dir, "..");
  try {
    const script = `import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs'; import {join} from 'node:path';
import {bindProjectRoot} from ${JSON.stringify(join(source, "src/project.ts"))};
import {loadAppearance,beginAppearance,stageAppearance,resolveAppearance} from ${JSON.stringify(join(source, "src/pi/appearance.ts"))};
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
const selected=loadAppearance({stateRoot,installRoot,scope:{kind:'user'}}), initialDraft=beginAppearance(selected);
const palette={kind:'custom',light:resolveAppearance(stageAppearance(initialDraft,{...draft.value,mode:'light'}),capability).palette,dark:resolveAppearance(stageAppearance(initialDraft,{...draft.value,mode:'dark'}),capability).palette};palette.light.text='#277CA7';
const bad=stageAppearance(initialDraft,{...draft.value,mode:'dark',palette}), before=readFileSync(join(stateRoot,'appearance/preferences.json'),'utf8');
let refused=false;try{saveWorkspaceAppearance({...a,capability:{color:'256',terminalAppearance:'unknown'},draft:bad})}catch(e){refused=e.message==='BAD_CONTRAST'}
if(!refused || readFileSync(join(stateRoot,'appearance/preferences.json'),'utf8')!==before)throw Error('indexed Apply committed before validation');
saveWorkspaceAppearance({...a,draft:bad}); const customSaved=readFileSync(join(stateRoot,'appearance/preferences.json'),'utf8');
const downgraded=prepareWorkspaceAppearance({...a,agentRoot:join(stateRoot,'runs/d/agent'),capability:{color:'256',terminalAppearance:'unknown'}});
if(!downgraded.warning || readFileSync(join(stateRoot,'appearance/preferences.json'),'utf8')!==customSaved)throw Error('fallback must preserve saved palette');
const reset=beginAppearance(loadAppearance({stateRoot,installRoot,scope:{kind:'user'}}));reset.value=null;saveWorkspaceAppearance({...a,capability:{color:'256',terminalAppearance:'unknown'},draft:reset});
if(loadAppearance({stateRoot,installRoot,scope:{kind:'user'}}).user!==null)throw Error('repair reset failed');
// A different truecolor runner changes this project's override after the
// indexed runner started. A valid user draft must still surface that fallback.
const projectView=loadAppearance({stateRoot,installRoot,scope:{kind:'project',binding:project}});
saveWorkspaceAppearance({...a,draft:stageAppearance(beginAppearance(projectView),bad.value)});
const userView=loadAppearance({stateRoot,installRoot,scope:{kind:'user'}});
const validUser=stageAppearance(beginAppearance(userView),{mode:'light',palette:{kind:'preset',name:'standard'},editorPaddingX:1,outputPad:1});
const applied=saveWorkspaceAppearance({...a,capability:{color:'256',terminalAppearance:'unknown'},draft:validUser});
if(!applied.warning || applied.snapshot.user.mode!=='light')throw Error('cross-scope warning was lost');
if(loadAppearance({stateRoot,installRoot,scope:{kind:'project',binding:project}}).project.palette.kind!=='custom')throw Error('project override overwritten');
console.log('SCOPED_STORE_OK');`;
    const result = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", "--eval", script], { env: { HOME: home, PATH: "/usr/bin:/bin" }, timeout: 10000 });
    expect(result.stderr.toString()).toBe(""); expect(result.stdout.toString()).toContain("SCOPED_STORE_OK"); expect(result.exitCode).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
