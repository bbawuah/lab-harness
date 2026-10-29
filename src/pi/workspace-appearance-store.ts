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
function materialize(agent: string, snapshot: Snapshot, capability: Capability): Record<string, unknown> {
  const themes = join(agent, "themes"); privateDirectory(agent); privateDirectory(themes);
  const draft = beginAppearance(snapshot), effective = resolveAppearance(draft, capability);
  for (const [index, mode] of (["light", "dark"] as const).entries()) {
    const value = { ...effective.preferences, mode };
    const artifacts = buildNativeArtifacts(resolveAppearance({ ...draft, value }, capability));
    const name = appearanceThemeNames[index]!;
    const path = join(themes, name + ".json");
    writePrivate(path, JSON.stringify({ ...artifacts.theme, name, ...(capability.color === "none" ? { colors: Object.fromEntries(Object.keys(artifacts.theme.colors).map(key => [key, ""])) } : {}) }) + "\n");
  }
  const previous = nativeAppearanceSettings(agent);
  const hasPreferences = snapshot.project !== null || snapshot.user !== null;
  const theme = hasPreferences ? effective.preferences.mode === "terminal" ? appearanceThemeNames.join("/") : `lab-appearance-${effective.mode}` : typeof previous.theme === "string" && !previous.theme.startsWith("lab-appearance-") ? previous.theme : "system";
  return { theme, editorPaddingX: hasPreferences ? effective.preferences.editorPaddingX : String(previous.theme ?? "").startsWith("lab-appearance-") ? 1 : previous.editorPaddingX ?? 0, outputPad: hasPreferences ? effective.preferences.outputPad : String(previous.theme ?? "").startsWith("lab-appearance-") ? 1 : previous.outputPad ?? 1 };
}
function validateAgent(stateRoot: string, agentRoot: string): void {
  const rel = relative(join(stateRoot, "runs"), agentRoot);
  if (!isAbsolute(agentRoot) || resolve(agentRoot) !== agentRoot || !rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) throw new Error("LAB_APPEARANCE_PRIVATE_PATH");
  privateDirectory(agentRoot);
}
export function prepareWorkspaceAppearance(options: { stateRoot: string; agentRoot: string; installRoot: string; project: ProjectBinding; capability: Capability }): { settings: Record<string, unknown>; themes: string[] } {
  verifyProjectBinding(options.project);
  validateAgent(options.stateRoot, options.agentRoot);
  const snapshot = loadAppearance({ stateRoot: options.stateRoot, installRoot: options.installRoot, scope: { kind: "project", binding: options.project } });
  const settings = materialize(options.agentRoot, snapshot, options.capability);
  verifyProjectBinding(options.project);
  return { settings, themes: appearanceThemeNames.map(name => join(options.agentRoot, "themes", name + ".json")) };
}
export function saveWorkspaceAppearance(options: { stateRoot: string; agentRoot: string; installRoot: string; project: ProjectBinding; capability: Capability; draft: Draft }): Snapshot {
  verifyProjectBinding(options.project);
  const scope = options.draft?.base?.scope;
  if (!scope || (scope.kind !== "user" && (scope.kind !== "project" || JSON.stringify(scope.binding) !== JSON.stringify(options.project)))) throw new Error("LAB_APPEARANCE_PROJECT_CHANGED");
  validateAgent(options.stateRoot, options.agentRoot);
  const saved = applyAppearance({ stateRoot: options.stateRoot, installRoot: options.installRoot, draft: options.draft });
  const { settings } = prepareWorkspaceAppearance(options);
  const path = join(options.agentRoot, "settings.json");
  const current = lstatSync(path, { throwIfNoEntry: false }) ? JSON.parse(readPrivate(path)) : {};
  if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("LAB_APPEARANCE_INVALID_STORE");
  writePrivate(path, JSON.stringify({ ...current, ...settings }) + "\n");
  verifyProjectBinding(options.project);
  return saved;
}
