/**
 * LAB permission policy: pure mode decisions, path integrity, session-grant
 * scopes and approval text. No Pi imports; the extension in
 * permission-extension.ts owns UI and state. See docs/permission-modes-contract.md.
 */
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { displaySafe, wrapColumns } from "./display.ts";

export const permissionModes = ["ask", "edits", "read-only", "auto"] as const;
export type PermissionMode = typeof permissionModes[number];
export const modeDescriptions: Record<PermissionMode, string> = {
  ask: "ask before edits, writes, shell commands, browser changes and Relay sends",
  edits: "file edits inside the project run; shell, browser and Relay sends still ask",
  "read-only": "reads only; every mutating tool is refused",
  auto: "everything runs without asking (explicit opt-in)",
};
/** Keyboard-free cycle used by /lab-mode next. It never enters auto. */
export const modeCycle: Record<PermissionMode, PermissionMode> = { ask: "edits", edits: "read-only", "read-only": "ask", auto: "ask" };
export function parseMode(value: unknown): PermissionMode | undefined {
  return typeof value === "string" && (permissionModes as readonly string[]).includes(value) ? value as PermissionMode : undefined;
}

export type ToolClass = "read" | "edit" | "bash" | "browser" | "relay-send" | "relay-ack" | "other";
const readTools = new Set(["read", "grep", "find", "ls", "lab_search", "lab_files", "relay_peers", "relay_inbox"]);
export function classify(toolName: string, input: Record<string, unknown> | undefined): ToolClass {
  if (readTools.has(toolName)) return "read";
  if (toolName === "edit" || toolName === "write") return "edit";
  if (toolName === "bash") return "bash";
  if (toolName === "relay_send") return "relay-send";
  if (toolName === "relay_ack") return "relay-ack";
  if (toolName === "lab_browser") return input?.operation === "snapshot" || input?.operation === "read" ? "read" : "browser";
  return "other"; // Unknown tools are treated as mutating.
}

export type Decision = { kind: "run" } | { kind: "ask" } | { kind: "refuse"; reason: string };
/** `insideProject` is only consulted for edit-class tools in edits mode. */
export function decide(mode: PermissionMode, toolName: string, klass: ToolClass, insideProject: boolean): Decision {
  if (klass === "read" || mode === "auto") return { kind: "run" };
  if (mode === "read-only") return { kind: "refuse", reason: `LAB_PERMISSION_REFUSED: ${displaySafe(toolName)} was not run because LAB is in read-only mode. Only the user can change the mode (/lab-mode).` };
  if (klass === "relay-ack") return { kind: "run" };
  if (mode === "edits" && klass === "edit" && insideProject) return { kind: "run" };
  return { kind: "ask" };
}
export function denial(toolName: string, why: string, note?: string): string {
  const cleanNote = note?.trim().slice(0, 500);
  return `LAB_PERMISSION_DENIED: ${displaySafe(toolName)} was not run (${why}). Do not retry it without asking the user.` + (cleanNote ? ` User note: ${cleanNote}` : "");
}

// ---------------------------------------------------------------------------
// Path integrity for edits mode
// ---------------------------------------------------------------------------
const unsafePathCharacters = /[\u0000-\u001f\u007f-\u009f\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u2060-\u206f\u3000\ufeff]/;
export type PathRoots = { project: string; excluded: string[] };
export type ResolvedPath = { absolute?: string; real?: string; inside: boolean; display: string };
function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}
function withinOrEqual(root: string, path: string): boolean { return path === root || within(root, path); }
/** Realpath of the deepest existing ancestor plus the remaining (already normalized) components. */
function realTarget(absolute: string): string | undefined {
  let probe = absolute; const rest: string[] = [];
  for (;;) {
    const entry = lstatSync(probe, { throwIfNoEntry: false });
    if (entry) {
      // A dangling symlink (leaf or ancestor) cannot be resolved: ask.
      try { return join(realpathSync(probe), ...rest.reverse()); } catch { return undefined; }
    }
    const parent = resolve(probe, "..");
    if (parent === probe) return undefined;
    rest.push(probe.slice(parent.length).replace(/^[/\\]/, "")); probe = parent;
  }
}
/** Mirrors pinned Pi resolveToCwd (strip @, ~ expansion, file://) but refuses ambiguous characters. */
export function resolveTargetPath(raw: unknown, cwd: string, roots: PathRoots): ResolvedPath {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return { inside: false, display: "(invalid path)" };
  if (unsafePathCharacters.test(raw)) return { inside: false, display: displaySafe(raw) + "  (unusual characters)" };
  let path = raw.startsWith("@") ? raw.slice(1) : raw;
  if (path === "~") path = homedir(); else if (path.startsWith("~/")) path = join(homedir(), path.slice(2));
  if (path.startsWith("file://")) { try { path = fileURLToPath(path); } catch { return { inside: false, display: displaySafe(raw) }; } }
  const absolute = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  let project: string;
  try { project = realpathSync(roots.project); } catch { return { absolute, inside: false, display: displaySafe(absolute) }; }
  const real = realTarget(absolute);
  const lexicalInside = within(resolve(roots.project), absolute) || within(project, absolute);
  const display = displaySafe(lexicalInside ? relative(within(project, absolute) ? project : resolve(roots.project), absolute) : absolute);
  if (!real) return { absolute, inside: false, display: display + "  (unresolvable)" };
  const excluded = roots.excluded.flatMap(path => { try { return [realpathSync(path)]; } catch { return [resolve(path)]; } });
  const inside = within(project, real) && !excluded.some(root => withinOrEqual(root, real));
  return { absolute, real, inside, display: inside ? displaySafe(relative(project, real)) : display + (real !== absolute ? `  → ${displaySafe(real)}` : "") + "  (outside project)" };
}

// ---------------------------------------------------------------------------
// Secret masking (prompts and browser rows)
// ---------------------------------------------------------------------------
const secretField = /pass(word|code|phrase)?|secret|token|api[\s_-]?key|\bkey\b|\bpin\b|otp|one[\s-]?time|2fa|mfa|cvv|cvc|security code|card(\s|-)?(number|no)|credit card|\bssn\b|social security|credential|private/i;
export function looksSecretValue(value: string): boolean {
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) return true; // JWT
  if (/^(sk-|sk_|pk_|rk_|ghp_|gho_|ghs_|github_pat_|xox[abposr]-|AKIA|ASIA|AIza|glpat-)/.test(value)) return true;
  if (/^\d{13,19}$/.test(value.replace(/[ -]/g, "")) && /^[\d -]+$/.test(value)) return true; // card-like digits
  if (value.length >= 20 && !/\s/.test(value)) {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(value)).length;
    if (classes >= 3) return true;
  }
  return false;
}
export function isSecretField(name: string | undefined, role: string | undefined): boolean {
  return secretField.test(name ?? "") || /password/i.test(role ?? "");
}
export function valuePreview(value: string, secret: boolean, max = 48): string {
  const chars = Array.from(value);
  if (secret || looksSecretValue(value)) return `•••• (masked, ${chars.length} chars)`;
  const shown = chars.length > max ? chars.slice(0, max).join("") + `… (${chars.length} chars)` : value;
  return '"' + displaySafe(shown) + '"';
}

// ---------------------------------------------------------------------------
// Approval descriptions and session-grant scopes
// ---------------------------------------------------------------------------
export type BrowserElement = { role: string; name: string };
export type BrowserFacts = { origin: string; element?: BrowserElement };
export type ApprovalFacts = { cwd: string; roots: PathRoots; browser?: (input: Record<string, unknown>) => BrowserFacts | undefined; fileSize?: (absolute: string) => number | undefined };
export type Approval = { heading: string; lines: string[]; scope: string; scopeLabel: string };
const previewLines = (text: string, prefix: string, limit: number) => {
  const lines = text.split("\n"); const shown = lines.slice(0, limit).map(line => prefix + line);
  if (lines.length > limit) shown.push(`${prefix}… ${lines.length - limit} more line(s)`);
  return shown;
};
const countLines = (text: string) => text === "" ? 0 : text.split("\n").length;
export function elementLabel(ref: unknown, element: BrowserElement | undefined): string {
  const safeRef = typeof ref === "string" ? displaySafe(ref.slice(0, 16)) : "@e?";
  return element ? `${safeRef} ${displaySafe(element.role.slice(0, 32))} "${displaySafe(element.name.slice(0, 80))}"` : safeRef;
}
export function describeApproval(toolName: string, input: Record<string, unknown>, facts: ApprovalFacts): Approval {
  const tool = displaySafe(toolName.slice(0, 64));
  if (toolName === "bash") {
    const command = typeof input.command === "string" ? input.command : "";
    const max = 4000, chars = Array.from(command);
    const shown = chars.length > max ? chars.slice(0, max).join("") : command;
    const lines = ["$ " + shown.split("\n").join("\n  ")];
    if (chars.length > max) lines.push(`… ${chars.length - max} more character(s) not shown`);
    lines.push("cwd: " + facts.cwd + (typeof input.timeout === "number" ? `   timeout: ${input.timeout}s` : ""));
    return { heading: "Run shell command?", lines, scope: `bash\0${facts.cwd}\0${command}`, scopeLabel: "this exact command in this folder" };
  }
  if (toolName === "edit" || toolName === "write") {
    const target = resolveTargetPath(input.path, facts.cwd, facts.roots);
    const scope = `${toolName}\0${target.real ?? target.absolute ?? String(input.path)}`;
    if (toolName === "write") {
      const content = typeof input.content === "string" ? input.content : "";
      const size = target.absolute ? facts.fileSize?.(target.absolute) : undefined;
      return { heading: "Write file?", scope, scopeLabel: "writes to this file",
        lines: [target.display, `${size === undefined ? "new file" : `overwrites ${size} bytes`} · ${countLines(content)} line(s), ${Buffer.byteLength(content)} bytes`, ...previewLines(content, "+ ", 8)] };
    }
    const edits = Array.isArray(input.edits) ? input.edits.filter((edit): edit is { oldText: string; newText: string } => !!edit && typeof edit.oldText === "string" && typeof edit.newText === "string") : [];
    const removed = edits.reduce((sum, edit) => sum + countLines(edit.oldText), 0), added = edits.reduce((sum, edit) => sum + countLines(edit.newText), 0);
    const lines = [target.display, `${edits.length} replacement(s) · −${removed} +${added} line(s)`];
    for (const edit of edits.slice(0, 2)) lines.push(...previewLines(edit.oldText, "- ", 4), ...previewLines(edit.newText, "+ ", 4));
    if (edits.length > 2) lines.push(`… ${edits.length - 2} more replacement(s)`);
    return { heading: "Edit file?", lines, scope, scopeLabel: "edits to this file" };
  }
  if (toolName === "lab_browser") {
    const operation = typeof input.operation === "string" ? input.operation : "action";
    const browser = facts.browser?.(input);
    const origin = browser?.origin ?? "(unknown origin)";
    const element = browser?.element;
    const lines = ["origin: " + displaySafe(origin)];
    if (operation === "navigate") {
      lines.push("navigate to: " + displaySafe(String(input.url ?? "").slice(0, 4096)));
      return { heading: "Browser: navigate?", lines, scope: `lab_browser\0${origin}\0navigate\0${String(input.url)}`, scopeLabel: "navigation to this URL" };
    }
    lines.push(`${displaySafe(operation.slice(0, 16))} ${elementLabel(input.ref, element)}`);
    if (operation === "fill") lines.push("value: " + valuePreview(typeof input.text === "string" ? input.text : "", isSecretField(element?.name, element?.role)));
    const what = element ? `${element.role}\0${element.name}` : `ref\0${String(input.ref)}`;
    return { heading: `Browser: ${displaySafe(operation.slice(0, 16))}?`, lines, scope: `lab_browser\0${origin}\0${operation}\0${what}`, scopeLabel: `${displaySafe(operation.slice(0, 16))} on this element` };
  }
  if (toolName === "relay_send") {
    const to = typeof input.to === "string" ? input.to : "";
    const body = typeof input.body === "string" ? input.body : "";
    const lines = ["to: " + displaySafe(to.slice(0, 128)), "request key: " + displaySafe(String(input.requestKey ?? "").slice(0, 128))];
    if (typeof input.replyTo === "string") lines.push("reply to: " + displaySafe(input.replyTo.slice(0, 128)));
    lines.push(...previewLines(Array.from(body).slice(0, 1200).join(""), "> ", 8));
    return { heading: "Send Relay message to another session?", lines, scope: `relay_send\0${to}`, scopeLabel: "messages to this peer" };
  }
  let json = ""; try { json = JSON.stringify(input) ?? ""; } catch { json = "(unserializable input)"; }
  return { heading: `Run tool ${tool}?`, lines: previewLines(Array.from(json).slice(0, 1200).join(""), "", 8), scope: `${toolName}\0${json}`, scopeLabel: "this exact call" };
}
export const approvalChoices = (approval: Approval) => ["Allow once", `Allow for this session (${approval.scopeLabel})`, "Deny", "Deny with note…"] as const;
/** Escaped, column-wrapped prompt title. Every row is <= width columns. */
export function approvalTitle(approval: Approval, mode: PermissionMode, width: number): string {
  const w = Math.max(10, Math.floor(width) || 80);
  const rows = [`LAB ${mode} mode · ${approval.heading}`, ...approval.lines.map(line => line.split("\n").map(part => displaySafe(part)).join("\n"))];
  return rows.flatMap(row => wrapColumns(row, w)).join("\n");
}
