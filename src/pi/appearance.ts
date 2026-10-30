import type { ProjectBinding } from "../project.ts";
import { light, dark } from "./appearance-theme.ts";
export { loadAppearance, applyAppearance } from "./appearance-store.ts";

export type Mode = "light" | "dark" | "terminal";
export type Color = string;
export type Palette = { accent: Color; text: Color; background: Color; border: Color; focus: Color; success: Color; warning: Color; error: Color };
export type PaletteChoice = { kind: "preset"; name: "standard" } | { kind: "custom"; light: Palette; dark: Palette };
export type Preferences = { mode: Mode; palette: PaletteChoice; editorPaddingX: 0 | 1 | 2 | 3; outputPad: 0 | 1 };
export type Scope = { kind: "user" } | { kind: "project"; binding: ProjectBinding };
export type Capability = { color: "truecolor" | "256" | "16" | "none" | "unknown"; terminalAppearance: "light" | "dark" | "unknown" };
export type Snapshot = { revision: string; user: Preferences | null; project: Preferences | null; scope: Scope };
export type Draft = { base: Snapshot; value: Preferences | null };
export type Effective = { preferences: Preferences; mode: "light" | "dark"; modeSource: "explicit" | "terminal" | "fallback"; palette: Palette; color: Capability["color"]; contrast: "pass" | "unknown" };
export type NativeArtifacts = { settings: { theme: string; editorPaddingX: 0 | 1 | 2 | 3; outputPad: 0 | 1 }; theme: { name: string; appearance: "light" | "dark"; colors: Record<string, string | number> } };
export type AppearanceErrorCode = "INVALID_INPUT" | "INVALID_COLOR" | "BAD_CONTRAST" | "INVALID_STORE" | "PRIVATE_PATH" | "PROJECT_CHANGED" | "CONFLICT" | "IO";
export class AppearanceError extends Error { constructor(readonly code: AppearanceErrorCode) { super(code); this.name = "AppearanceError"; } }
const fail = (code: AppearanceErrorCode): never => { throw new AppearanceError(code); };
const roles = ["accent", "text", "background", "border", "focus", "success", "warning", "error"] as const;
const presets: Record<"light" | "dark", Palette> = {
 light: {accent:"#005A9C",text:"#202020",background:"#FFFFFF",border:"#595959",focus:"#005A9C",success:"#176B32",warning:"#785600",error:"#A11B1B"},
 dark: {accent:"#8ECFFF",text:"#F2F2F2",background:"#151515",border:"#B0B0B0",focus:"#8ECFFF",success:"#8DDAA0",warning:"#F2CE71",error:"#FFAAAA"},
};
const defaults: Preferences = {mode:"dark", palette:{kind:"preset",name:"standard"}, editorPaddingX:1, outputPad:1};
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
 if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail("INVALID_INPUT");
 return value as Record<string, unknown>;
}
function palette(value: unknown): Palette {
 const input = object(value, roles), out = {} as Palette;
 for (const role of roles) { const v = input[role]; if (typeof v !== "string" || !/^#[\da-fA-F]{6}$/.test(v)) fail("INVALID_COLOR"); out[role] = (v as string).toUpperCase(); }
 contrast(out); return out;
}
function rgb(hex: string): number[] { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
function luminance(hex: string): number { return rgb(hex).reduce((sum,c,i) => { const s=c/255; return sum + [0.2126,0.7152,0.0722][i]! * (s <= 0.04045 ? s/12.92 : ((s+0.055)/1.055)**2.4); }, 0); }
function contrast(p: Palette): void { const bg=luminance(p.background); for (const role of roles) { if(role === "background") continue; const v=luminance(p[role]); if ((Math.max(v,bg)+0.05)/(Math.min(v,bg)+0.05) < (role === "border" || role === "focus" ? 3 : 4.5)) fail("BAD_CONTRAST"); } }
export function normalizePreferences(value: unknown): Preferences {
 const v=object(value,["mode","palette","editorPaddingX","outputPad"]);
 if (!["light","dark","terminal"].includes(v.mode as string) || ![0,1,2,3].includes(v.editorPaddingX as number) || ![0,1].includes(v.outputPad as number)) fail("INVALID_INPUT");
 const raw=v.palette as Record<string,unknown>; let choice: PaletteChoice;
 if (raw?.kind === "preset") { object(raw,["kind","name"]); if (raw.name !== "standard") fail("INVALID_INPUT"); choice={kind:"preset",name:"standard"}; }
 else { const c=object(raw,["kind","light","dark"]); if(c.kind !== "custom") fail("INVALID_INPUT"); choice={kind:"custom",light:palette(c.light),dark:palette(c.dark)}; }
 return {mode:v.mode as Mode,palette:choice,editorPaddingX:v.editorPaddingX as Preferences["editorPaddingX"],outputPad:v.outputPad as Preferences["outputPad"]};
}
export function beginAppearance(snapshot: Snapshot): Draft { return {base:structuredClone(snapshot),value:structuredClone(snapshot.scope.kind === "user" ? snapshot.user : snapshot.project)}; }
export function stageAppearance(draft: Draft, value: unknown): Draft { return {base:structuredClone(draft.base),value:normalizePreferences(value)}; }
export function resetAppearance(draft: Draft): Draft { return {base:structuredClone(draft.base),value:null}; }
function indexColor(hex: string): {index:number; hex:string} {
 const levels=[0,95,135,175,215,255]; const src=rgb(hex); let best=Infinity, bestIndex=16, bestRGB=[0,0,0];
 for(let i=16;i<256;i++) { const x=i-16; const c=i<232 ? [levels[Math.floor(x/36)]!,levels[Math.floor(x/6)%6]!,levels[x%6]!] : [8+(i-232)*10,8+(i-232)*10,8+(i-232)*10]; const d=c.reduce((n,v,j)=>n+(v-src[j]!)**2,0); if(d<best) {best=d;bestIndex=i;bestRGB=c;} }
 return {index:bestIndex,hex:"#"+bestRGB.map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase()};
}
export function resolveAppearance(draft: Draft, capability: Capability): Effective {
 if (!capability || !["truecolor","256","16","none","unknown"].includes(capability.color) || !["light","dark","unknown"].includes(capability.terminalAppearance)) fail("INVALID_INPUT");
 const preferences=normalizePreferences(draft.value ?? (draft.base.scope.kind === "project" ? draft.base.user : null) ?? defaults);
 const modeSource=preferences.mode !== "terminal" ? "explicit" : capability.terminalAppearance === "unknown" ? "fallback" : "terminal";
 const mode=preferences.mode !== "terminal" ? preferences.mode : capability.terminalAppearance === "unknown" ? "dark" : capability.terminalAppearance;
 const colors=structuredClone(preferences.palette.kind === "preset" ? presets[mode] : preferences.palette[mode]);
 if(capability.color === "256") { const downgraded=Object.fromEntries(roles.map(role=>[role,indexColor(colors[role]).hex])) as Palette; contrast(downgraded); }
 return {preferences,mode,modeSource,palette:colors,color:capability.color,contrast:capability.color === "truecolor" || capability.color === "256" ? "pass" : "unknown"};
}
export function buildNativeArtifacts(effective: Effective): NativeArtifacts {
 const p=effective.palette; const convert=(c:string): string|number => effective.color === "256" ? indexColor(c).index : c;
 const colors: Record<string,string|number> = {...(effective.mode === "light" ? light : dark),accent:convert(p.accent),text:convert(p.text),border:convert(p.border),borderAccent:convert(p.focus),success:convert(p.success),warning:convert(p.warning),error:convert(p.error)};
 for (const k of ["selectedBg","searchMatchBg","userMessageBg","customMessageBg","toolPendingBg","toolSuccessBg","toolErrorBg"]) colors[k]=convert(p.background);
 return {settings:{theme:"lab-appearance",editorPaddingX:effective.preferences.editorPaddingX,outputPad:effective.preferences.outputPad},theme:{name:"lab-appearance",appearance:effective.mode,colors}};
}
