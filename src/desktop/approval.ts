/**
 * Desktop approval: pure description plus single-use approval tokens.
 *
 * Every desktop action (click/type/scroll/press) asks in every permission
 * mode, including auto, with only "Allow once" or "Deny". There is no
 * session grant. The gate mints a token bound to the exact canonical input,
 * the tool call id and the bound window; DesktopSession refuses an action
 * without an unused genuine token, so a missing or bypassed gate fails closed.
 */
import { maskedValue } from "./display.ts";
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
export const desktopChoices = ["Allow once", "Deny"] as const;

export function elementText(element: Element | undefined, ref: unknown): string {
  if (!element) return typeof ref === "string" ? ref.slice(0, 32) : "(unknown element)";
  const label = element.name ?? "";
  return `${element.role.slice(0, 32)} "${Array.from(label).slice(0, 80).join("")}"`;
}

export function describeDesktopApproval(input: DesktopInput, facts: DesktopFacts): DesktopApprovalText {
  const op = input.operation;
  const lines = [`in ${facts.app} · ${facts.title || "(untitled window)"}`];
  if (facts.uncertain) lines.push("! The previous desktop action's delivery is unknown. Look at the window before allowing another.");
  if (op === "press") lines.push(`press ${String(input.key)} (sent only to this app's window)`);
  else lines.push(`${op} ${elementText(facts.element, input.ref)}`);
  if (op === "type") lines.push("value: " + maskedValue(typeof input.text === "string" ? input.text : "", facts.element));
  if (op === "scroll") lines.push(`direction: ${String(input.direction)} · amount: ${String(input.amount)}`);
  lines.push("No \"always\" for desktop: each action asks.");
  return { heading: `Desktop: ${op}?`, lines };
}
