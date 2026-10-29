/** Operator-only appearance staging; native Pi retains ownership of its viewport and themes. */
import { beginAppearance, resetAppearance, resolveAppearance, stageAppearance, type Capability, type Draft, type Palette, type Preferences, type Snapshot } from "./appearance.ts";

export type AppearanceRequest = { action: "appearance-load"; scope: "user" | "project" } | { action: "appearance-apply"; draft: Draft };
export type AppearanceUI = {
  select(title: string, choices: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(text: string, kind?: "error" | "info"): void;
  custom<T>(factory: (tui: { terminal: { rows: number }; requestRender(): void }, theme: unknown, keys: unknown, done: (value: T) => void) => { render(width: number): string[]; invalidate(): void; handleInput(data: string): void }): Promise<T>;
};
export function appearanceCapability(env: NodeJS.ProcessEnv): Capability {
  return { color: env.NO_COLOR !== undefined || env.TERM === "dumb" ? "none" : /truecolor|24bit/i.test(env.COLORTERM ?? "") ? "truecolor" : /256color/.test(env.TERM ?? "") ? "256" : "16", terminalAppearance: "unknown" };
}
const roles: (keyof Palette)[] = ["accent", "text", "background", "border", "focus", "success", "warning", "error"];
const labels = ["Scope", "Mode", "Palette", "Editor padding", "Transcript padding", "Reset this scope", "Apply", "Cancel"] as const;
type Action = typeof labels[number];
function safeFailure(error: unknown): string {
  const code = error instanceof Error && /^LAB_APPEARANCE_[A-Z_]+$/.test(error.message) ? error.message : "LAB_APPEARANCE_REFUSED";
  return code + ". Reload the dialog before retrying. An IO error may have committed; do not blindly repeat Apply.";
}
function preferences(draft: Draft, capability: Capability): Preferences { return resolveAppearance(draft, capability).preferences; }
function patch(draft: Draft, values: Partial<Preferences>, capability: Capability): Draft { return stageAppearance(draft, { ...preferences(draft, capability), ...values }); }
/** A local sample only: no native setTheme call and no persistence before Apply. */
export function appearanceSample(draft: Draft, capability: Capability, width: number): string[] {
  const effective = resolveAppearance(draft, capability), cut = (s: string) => s.slice(0, Math.max(1, width));
  const sample = ["> Focused control", "Text / Success: saved / Warning: check", "Error: retry (labels do not rely on color)"];
  if (capability.color !== "truecolor" && capability.color !== "256") return sample.map(cut);
  const p = effective.palette;
  const color = (role: keyof Palette, text: string) => {
    const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(";");
    // Preview uses explicit RGB only on declared truecolor terminals. 256-color
    // preview uses native indexed artifacts after Apply; retain plain text here.
    return capability.color === "truecolor" ? `\x1b[38;2;${rgb(p[role])}m\x1b[48;2;${rgb(p.background)}m${cut(text)}\x1b[0m` : cut(text);
  };
  return [color("focus", sample[0]!), color("text", sample[1]!), color("error", sample[2]!)];
}
async function menu(ui: AppearanceUI, draft: Draft, capability: Capability): Promise<Action> {
  return ui.custom<Action>((tui, _theme, _keys, done) => {
    let index = 0;
    const p = preferences(draft, capability);
    const suffix = [draft.base.scope.kind, p.mode === "terminal" ? "follow terminal (dark fallback)" : p.mode, p.palette.kind === "preset" ? "Standard" : "Custom", String(p.editorPaddingX), String(p.outputPad), draft.value === null ? "inherited/default" : "remove saved override", "save and reload Pi resources", "discard this draft"];
    return {
      invalidate() {},
      render(width) {
        const lines = ["LAB Appearance - staged sample", ...labels.map((label, i) => `${i === index ? ">" : " "} ${i + 1}. ${label}: ${suffix[i]}`), "", ...appearanceSample(draft, capability, width), "Up/Down or j/k; Enter. Esc cancels.", "Fonts/size/line height: terminal settings."];
        const height = Math.max(3, tui.terminal.rows - 4), start = Math.max(0, Math.min(index + 1 - height + 2, lines.length - height));
        return lines.slice(start, start + height).map(line => line.startsWith("\x1b") ? line : line.slice(0, Math.max(1, width)));
      },
      handleInput(data) {
        if (data === "\x1b" || data === "\x03") { done("Cancel"); return; }
        if (data === "\x1b[A" || data === "k") index = (index + labels.length - 1) % labels.length;
        else if (data === "\x1b[B" || data === "j" || data === "\t") index = (index + 1) % labels.length;
        else if (/^[1-8]$/.test(data)) { index = Number(data) - 1; done(labels[index]!); return; }
        else if (data === "\r" || data === "\n") { done(labels[index]!); return; }
        tui.requestRender();
      },
    };
  });
}
/** Called only from a user slash command. No credential/model/network operation occurs. */
export async function configureAppearance(ui: AppearanceUI, bridge: (request: AppearanceRequest) => Promise<unknown>, capability: Capability, idle: () => boolean, reload: () => Promise<void>): Promise<void> {
  if (!idle()) { ui.notify("Finish or cancel the active model turn before changing appearance.", "info"); return; }
  let draft: Draft;
  try { draft = beginAppearance(await bridge({ action: "appearance-load", scope: "user" }) as Snapshot); }
  catch (error) { ui.notify(safeFailure(error), "error"); return; }
  for (;;) {
    try {
      const action = await menu(ui, draft, capability);
      if (action === "Cancel") return;
      if (action === "Scope") {
        const scope = await ui.select("Scope (changing scope discards this unsaved draft)", ["User defaults", "This project only"]);
        if (scope) draft = beginAppearance(await bridge({ action: "appearance-load", scope: scope === "User defaults" ? "user" : "project" }) as Snapshot);
      } else if (action === "Mode") {
        const mode = await ui.select("Mode", ["dark", "light", "terminal"]);
        if (mode) draft = patch(draft, { mode: mode as Preferences["mode"] }, capability);
      } else if (action === "Editor padding" || action === "Transcript padding") {
        const value = await ui.select(action, action === "Editor padding" ? ["0", "1", "2", "3"] : ["0", "1"]);
        if (value) draft = patch(draft, action === "Editor padding" ? { editorPaddingX: Number(value) as Preferences["editorPaddingX"] } : { outputPad: Number(value) as Preferences["outputPad"] }, capability);
      } else if (action === "Reset this scope") draft = resetAppearance(draft);
      else if (action === "Palette") {
        const kind = await ui.select("Palette", ["Standard", "Custom semantic color"]);
        if (kind === "Standard") draft = patch(draft, { palette: { kind: "preset", name: "standard" } }, capability);
        if (kind === "Custom semantic color") {
          const mode = await ui.select("Palette appearance", ["light", "dark"]) as "light" | "dark" | undefined;
          const role = mode && await ui.select("Semantic role", roles) as keyof Palette | undefined;
          if (!mode || !role) continue;
          const current = preferences(draft, capability), palette = current.palette.kind === "custom" ? structuredClone(current.palette) : { kind: "custom" as const, light: resolveAppearance(patch(draft, { mode: "light" }, capability), capability).palette, dark: resolveAppearance(patch(draft, { mode: "dark" }, capability), capability).palette };
          const value = await ui.input(`${mode} ${role}: #RRGGBB (contrast is checked)`, palette[mode][role]);
          if (value !== undefined) { palette[mode][role] = value; draft = patch(draft, { palette }, capability); }
        }
      } else if (action === "Apply") {
        if (!idle()) { ui.notify("The workspace became busy. Finish or cancel the active turn; the draft is still open.", "info"); continue; }
        // Bridge saves via CAS and materializes native themes/settings. No use of
        // this command context is allowed after supported runtime replacement.
        await bridge({ action: "appearance-apply", draft });
        ui.notify("Appearance saved. Reloading native Pi resources; the right shell keeps its own styling.", "info");
        await reload(); return;
      }
    } catch (error) {
      if (error instanceof Error && ["INVALID_COLOR", "BAD_CONTRAST", "INVALID_INPUT"].includes(error.message)) ui.notify("Choose a #RRGGBB color with readable contrast against the background. Draft unchanged.", "error");
      else { ui.notify(safeFailure(error), "error"); return; }
    }
  }
}
