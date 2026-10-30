import type { AppearanceErrorCode } from "../src/pi/appearance.ts";
import { test, expect } from "bun:test";
import { AppearanceError, applyAppearance, beginAppearance, buildNativeArtifacts, loadAppearance, normalizePreferences, resetAppearance, resolveAppearance, stageAppearance, type Palette, type Snapshot } from "../src/pi/appearance.ts";


// Schema projection from Pi 1.4.0 commit 4a080252f06caf63a525d7873c5d94d3c23887e0:
// theme-schema.ts SHA-256 6440ccc6aa0576f0f9447584b707b3bf09f2b77aed64687f4598db261588474b,
// theme-tokens.ts SHA-256 6c38a169da4f85ee04bc31980a13ef6a498b6be68e63faceda4f5a1e5c632ecf.
// This independently checks the emitted subset of the pinned schema, not Pi runtime loading.
const tokens = "accent border borderAccent borderMuted success error warning muted dim text thinkingText scrollbarTrack scrollbarThumb selectedBg searchMatchBg searchMatchText userMessageBg userMessageText customMessageBg customMessageText customMessageLabel toolPendingBg toolSuccessBg toolErrorBg toolTitle toolOutput mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh thinkingMax bashMode".split(" ");
const optional = new Set(["scrollbarTrack","scrollbarThumb","searchMatchBg","searchMatchText","thinkingMax"]);
function pinnedThemeFields(value: unknown): boolean {
 if(!value || typeof value!=="object" || Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["name","appearance","colors"].includes(k)) || typeof v.name!=="string" || v.name.includes("/") || !["light","dark"].includes(v.appearance as string) || !v.colors || typeof v.colors!=="object" || Array.isArray(v.colors)) return false;
 const colors=v.colors as Record<string,unknown>;
 if(Object.keys(colors).some(k=>!tokens.includes(k)) || tokens.some(k=>!optional.has(k) && !Object.hasOwn(colors,k)))return false;
 return Object.values(colors).every(c=>typeof c==="string" || (typeof c==="number" && Number.isInteger(c) && c>=0 && c<=255));
}

const base: Snapshot = { revision:"absent",user:null,project:null,scope:{kind:"user"} };
const pref = {mode:"terminal", palette:{kind:"preset",name:"standard"}, editorPaddingX:2, outputPad:0};
const palette: Palette = {accent:"#005A9C",text:"#202020",background:"#FFFFFF",border:"#595959",focus:"#005A9C",success:"#176B32",warning:"#785600",error:"#A11B1B"};
function code(fn:()=>unknown, expected:AppearanceErrorCode) { try { fn(); throw new Error("expected failure"); } catch(e) {expect(e).toBeInstanceOf(AppearanceError); expect((e as AppearanceError).code).toBe(expected); expect((e as Error).message).toBe(expected);} }

test("pure staging, reset and scoped inheritance",()=>{
 const initial=beginAppearance(base), draft=stageAppearance(initial,pref);
 expect(initial.value).toBeNull(); expect(base.user).toBeNull(); expect(resetAppearance(draft).value).toBeNull();
 const project: Snapshot = {revision:"synthetic",user:normalizePreferences(pref),project:null,scope:{kind:"project",binding:{root:"/synthetic/project",device:1,inode:2}}};
 const inherited=resolveAppearance(beginAppearance(project),{color:"none",terminalAppearance:"light"}); expect(inherited.mode).toBe("light"); expect(inherited.contrast).toBe("unknown");
 expect(resolveAppearance(beginAppearance(base),{color:"unknown",terminalAppearance:"light"}).mode).toBe("dark");
});
test("strict normalization rejects unknown fields, invalid colors and poor contrast",()=>{
 expect(normalizePreferences(pref).editorPaddingX).toBe(2); code(()=>normalizePreferences({...pref,unexpected:true}),"INVALID_INPUT"); code(()=>normalizePreferences({...pref,outputPad:2}),"INVALID_INPUT");
 const custom={kind:"custom",light:palette,dark:palette};
 expect(normalizePreferences({...pref,palette:custom}).palette.kind).toBe("custom");
 code(()=>normalizePreferences({...pref,palette:{...custom,light:{...palette,text:"red"}}}),"INVALID_COLOR");
 code(()=>normalizePreferences({...pref,palette:{...custom,light:{...palette,text:"#FFFFFF"}}}),"BAD_CONTRAST");
});
test("module sample derives light, dark and fallback with non-color focus and status labels",()=>{
 const draft=stageAppearance(beginAppearance(base),pref);
 for(const [terminalAppearance,mode,source] of [["light","light","terminal"],["dark","dark","terminal"],["unknown","dark","fallback"]] as const) {
  const e=resolveAppearance(draft,{color:"none",terminalAppearance});
  // Mock adapter text is a rendered MODULE SAMPLE, not a Pi or whole-app preview.
  const sample=`> Focused choice\nSuccess: saved\nWarning: check\nError: retry\n${e.mode} (${e.modeSource})`;
  expect(sample).toContain("> Focused choice"); expect(sample).toContain("Error: retry"); expect(sample).not.toContain("\x1b"); expect([e.mode,e.modeSource,e.contrast]).toEqual([mode,source,"unknown"]);
 }
});
test("pinned complete theme tokens and honest capability qualification",()=>{
 const draft=stageAppearance(beginAppearance(base),pref);
 for(const color of ["truecolor","256","16","none","unknown"] as const) for(const terminalAppearance of ["light","dark"] as const) {
  const e=resolveAppearance(draft,{color,terminalAppearance}); const a=buildNativeArtifacts(e);
  expect(e.contrast).toBe(color==="truecolor"||color==="256"?"pass":"unknown"); expect(a.theme.appearance).toBe(terminalAppearance); expect(a.theme.name).toBe("lab-appearance"); expect(pinnedThemeFields(a.theme)).toBe(true);
  expect(pinnedThemeFields({...a.theme,colors:{...a.theme.colors,extra:"#000000"}})).toBe(false);
  const {text: _missing,...withoutText}=a.theme.colors; expect(pinnedThemeFields({...a.theme,colors:withoutText})).toBe(false);
  expect(pinnedThemeFields({...a.theme,colors:{...a.theme.colors,text:256}})).toBe(false); expect(a.settings.outputPad).toBe(0);
  if(color==="256") expect(typeof a.theme.colors.accent).toBe("number");
 }
});
test("untrusted paths fail with canonical safe code",()=>{
 const scope={kind:"user"} as const; const options={stateRoot:"/synthetic/not-accessible",installRoot:"/synthetic/install",scope};
 code(()=>loadAppearance(options),"PRIVATE_PATH"); code(()=>applyAppearance({...options,draft:beginAppearance(base)}),"PRIVATE_PATH");
});
