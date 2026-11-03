/**
 * Desktop approval: pure description plus single-use approval tokens.
 *
 * Every desktop action (click/type/scroll/press) asks in every permission
 * mode, including auto, with only "Allow once" or "Deny". There is no
 * session grant. The gate mints a token bound to the exact canonical input,
 * the tool call id and the bound window; DesktopSession refuses an action
 * without an unused genuine token, so a missing or bypassed gate fails closed.
 */
import { lineBreaks, maskedValue, oneLine } from "./display.ts";
import type { Element } from "./projection.ts";

export type DesktopOperation = "snapshot" | "read" | "click" | "type" | "scroll" | "press";
export type DesktopInput = { operation: DesktopOperation; ref?: string; property?: "text" | "value"; text?: string; direction?: "up" | "down" | "left" | "right"; amount?: number; key?: string };
export const actionOperations = new Set<string>(["click", "type", "scroll", "press"]);
export const isAction = (input: unknown) => !!input && typeof input === "object" && actionOperations.has((input as any).operation);

const fields = ["operation", "ref", "property", "text", "direction", "amount", "key"] as const;
/** Canonical, key-ordered serialization of the fields LAB passes on; anything else makes it unmatchable. */
export function canonicalInput(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "\0invalid";
  const o = input as Record<string, unknown>;
  if (Object.keys(o).some(k => !(fields as readonly string[]).includes(k))) return "\0invalid";
  return JSON.stringify(fields.map(k => [k, o[k] === undefined ? null : o[k]]));
}

export type DesktopApproval = { readonly toolCallId: string; readonly input: string; readonly binding: string };
const issued = new WeakMap<DesktopApproval, { used: boolean }>();

/** One pending approval per tool call; taken exactly once by the tool's execute. */
export class DesktopApprovals {
  private pending = new Map<string, DesktopApproval>();
  grant(toolCallId: string, input: unknown, binding: string): DesktopApproval {
    const approval = Object.freeze({ toolCallId, input: canonicalInput(input), binding });
    issued.set(approval, { used: false });
    this.pending.set(toolCallId, approval);
    return approval;
  }
  take(toolCallId: string): DesktopApproval | undefined {
    const approval = this.pending.get(toolCallId); this.pending.delete(toolCallId); return approval;
  }
  clear() { this.pending.clear(); }
}

/** True once per genuine unused token whose input and binding match; marks it used. */
export function redeem(approval: DesktopApproval | undefined, input: unknown, binding: string): boolean {
  const state = approval && issued.get(approval);
  if (!approval || !state || state.used) return false;
  state.used = true;
  return approval.input === canonicalInput(input) && approval.input !== "\0invalid" && approval.binding === binding;
}

export type DesktopFacts = { app: string; title: string; element?: Element; uncertain?: boolean };
/** Same shape as the shared permission prompt (heading + raw lines); rendering escapes and wraps. */
export type DesktopApprovalText = { heading: string; lines: string[] };
/** Longest `type` value, in code points (schema, validation and prompt). */
export const TEXT_LIMIT = 400;
/** How long `press` waits after approval for the user to focus the attached window. */
export const FOCUS_WAIT_MS = 10000;
export const desktopChoices = ["Allow once", "Deny"] as const;

export function elementText(element: Element | undefined, ref: unknown): string {
  if (!element) return typeof ref === "string" ? oneLine(ref, 32) : "(unknown element)";
  return `${oneLine(element.role, 32)} "${oneLine(element.name ?? "", 80)}"`;
}

export function describeDesktopApproval(input: DesktopInput, facts: DesktopFacts): DesktopApprovalText {
  const op = input.operation;
  // Every line is built from single-line fields, so untrusted text cannot add or hide lines.
  const lines = [`in ${oneLine(facts.app, 40)} · ${oneLine(facts.title || "(untitled window)")}`];
  if (facts.uncertain) lines.push("! The previous desktop action's delivery is unknown. Look at the window before allowing another.");
  if (op === "press") lines.push(`press ${oneLine(String(input.key), 16)} → goes to ${oneLine(facts.app, 40)}'s focused window. After Allow, click into the attached window within ${FOCUS_WAIT_MS / 1000} s; LAB sends it only while that window is focused.`);
  else lines.push(`${op} ${elementText(facts.element, input.ref)}`);
  if (op === "type") {
    // The prompt shows the whole value (it wraps), so nothing typed is hidden past a cap.
    const text = typeof input.text === "string" ? input.text : "";
    lines.push("value: " + maskedValue(text, facts.element, TEXT_LIMIT));
    const breaks = lineBreaks(text);
    if (breaks) lines.push(`contains ${breaks} line break${breaks === 1 ? "" : "s"}; each is typed as Return (⏎), which can submit`);
  }
  if (op === "scroll") lines.push(`direction: ${oneLine(String(input.direction), 8)} · amount: ${oneLine(String(input.amount), 4)}`);
  lines.push("No \"always\" for desktop: each action asks.");
  return { heading: `Desktop: ${op}?`, lines };
}
