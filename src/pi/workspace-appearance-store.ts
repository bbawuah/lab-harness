/** Bun-only integration of private preferences with native Pi artifacts. */
import { lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { verifyProjectBinding, type ProjectBinding } from "../project.ts";
import { applyAppearance, beginAppearance, buildNativeArtifacts, loadAppearance, resolveAppearance, type Capability, type Draft, type Snapshot } from "./appearance.ts";
import { privateDirectory, readPrivate, writePrivate } from "./workspace-config.ts";
export const appearanceThemeNames = ["lab-appearance-light", "lab-appearance-dark"] as const;
export function nativeAppearanceSettings(agent: string): Record<string, unknown> {
  const path = join(agent, "settings.json");
  if (!lstatSync(path, { throwIfNoEntry: false })) return {};
  const value: unknown = JSON.parse(readPrivate(path));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LAB_APPEARANCE_INVALID_STORE");
  const v = value as Record<string, unknown>, result: Record<string, unknown> = {};
  if (typeof v.theme === "string" && v.theme.length <= 256 && !/[\x00-\x1f]/.test(v.theme)) result.theme = v.theme;
  if ([0, 1, 2, 3].includes(v.editorPaddingX as number)) result.editorPaddingX = v.editorPaddingX;
  if ([0, 1].includes(v.outputPad as number)) result.outputPad = v.outputPad;
  return result;
}
/** Validate both variants before publishing artifacts or committing preferences. */
function compile(draft: Draft, capability: Capability) {
  const preferences = resolveAppearance(draft, { ...capability, color: "truecolor" }).preferences;
  return (["light", "dark"] as const).map(mode => buildNativeArtifacts(resolveAppearance({ ...draft, value: { ...preferences, mode } }, capability)));
}
function materialize(agent: string, snapshot: Snapshot, capability: Capability): { settings: Record<string, unknown>; warning?: string } {
  const draft = beginAppearance(snapshot), effective = resolveAppearance(draft, { ...capability, color: "truecolor" });
  let artifacts: ReturnType<typeof compile>, warning: string | undefined;
  try { artifacts = compile(draft, capability); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "BAD_CONTRAST" || capability.color !== "256") throw error;
    // Capability changes must not lock the operator out of the repair dialog.
    // Only this runner falls back; saved preferences remain byte-for-byte intact.
    artifacts = compile({ ...draft, value: { ...effective.preferences, palette: { kind: "preset", name: "standard" } } }, capability);
    warning = "Custom colors cannot preserve contrast in 256 colors. Using Standard for this run; use /lab-appearance to edit or Reset. Saved preferences are unchanged.";
  }
  const themes = join(agent, "themes"); privateDirectory(agent); privateDirectory(themes);
  for (const [index, artifact] of artifacts.entries()) {
    const name = appearanceThemeNames[index]!;
    const colors = capability.color === "none" ? Object.fromEntries(Object.keys(artifact.theme.colors).map(key => [key, ""])) : artifact.theme.colors;
    writePrivate(join(themes, name + ".json"), JSON.stringify({ ...artifact.theme, name, colors }) + "\n");
  }
  const previous = nativeAppearanceSettings(agent), hasPreferences = snapshot.project !== null || snapshot.user !== null;
  const theme = hasPreferences ? effective.preferences.mode === "terminal" ? appearanceThemeNames.join("/") : `lab-appearance-${effective.mode}` : typeof previous.theme === "string" && !previous.theme.startsWith("lab-appearance-") ? previous.theme : "system";
  return { settings: { theme, editorPaddingX: hasPreferences ? effective.preferences.editorPaddingX : String(previous.theme ?? "").startsWith("lab-appearance-") ? 1 : previous.editorPaddingX ?? 0, outputPad: hasPreferences ? effective.preferences.outputPad : String(previous.theme ?? "").startsWith("lab-appearance-") ? 1 : previous.outputPad ?? 1 }, ...(warning ? { warning } : {}) };
}
function validateAgent(stateRoot: string, agentRoot: string): void {
  const rel = relative(join(stateRoot, "runs"), agentRoot);
  if (!isAbsolute(agentRoot) || resolve(agentRoot) !== agentRoot || !rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) throw new Error("LAB_APPEARANCE_PRIVATE_PATH");
  privateDirectory(agentRoot);
}
export function prepareWorkspaceAppearance(options: { stateRoot: string; agentRoot: string; installRoot: string; project: ProjectBinding; capability: Capability }): { settings: Record<string, unknown>; themes: string[]; warning?: string } {
  verifyProjectBinding(options.project);
  validateAgent(options.stateRoot, options.agentRoot);
  const snapshot = loadAppearance({ stateRoot: options.stateRoot, installRoot: options.installRoot, scope: { kind: "project", binding: options.project } });
  const result = materialize(options.agentRoot, snapshot, options.capability);
  verifyProjectBinding(options.project);
  return { ...result, themes: appearanceThemeNames.map(name => join(options.agentRoot, "themes", name + ".json")) };
}
export function saveWorkspaceAppearance(options: { stateRoot: string; agentRoot: string; installRoot: string; project: ProjectBinding; capability: Capability; draft: Draft }): Snapshot {
  verifyProjectBinding(options.project);
  const scope = options.draft?.base?.scope;
  if (!scope || (scope.kind !== "user" && (scope.kind !== "project" || JSON.stringify(scope.binding) !== JSON.stringify(options.project)))) throw new Error("LAB_APPEARANCE_PROJECT_CHANGED");
  validateAgent(options.stateRoot, options.agentRoot);
  // Reject bad staged variants before CAS; Reset must remain possible.
  if (options.draft.value !== null) compile(options.draft, options.capability);
  const saved = applyAppearance({ stateRoot: options.stateRoot, installRoot: options.installRoot, draft: options.draft });
  const { settings } = prepareWorkspaceAppearance(options);
  const path = join(options.agentRoot, "settings.json");
  const current = lstatSync(path, { throwIfNoEntry: false }) ? JSON.parse(readPrivate(path)) : {};
  if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("LAB_APPEARANCE_INVALID_STORE");
  writePrivate(path, JSON.stringify({ ...current, ...settings }) + "\n");
  verifyProjectBinding(options.project);
  return saved;
}
