/**
 * Desktop row and value text. Output here is raw; the Pi renderer escapes and
 * wraps it with the shared displaySafe/wrapColumns before it reaches the
 * terminal. Masking rules match the permission-modes prompts (#26).
 */
import type { Element } from "./projection.ts";

const secretLabel = /pass(word|code|phrase)?|secret|token|api[\s_-]?key|\bkey\b|\bpin\b|otp|one[\s-]?time|2fa|mfa|cvv|cvc|security code|card(\s|-)?(number|no)|credit card|\bssn\b|social security|credential|private/i;

/** macOS AXSecureTextField surfaces as a "secure" state; never readable or typable. */
export const isSecure = (element: Element | undefined) => !!element?.states?.some(s => s.toLowerCase() === "secure") || /securetextfield/i.test(element?.role ?? "");
export const isSecretElement = (element: Element | undefined) => isSecure(element) || secretLabel.test(element?.name ?? "") || /password/i.test(element?.role ?? "");

export function looksSecretValue(value: string): boolean {
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) return true;
  if (/^(sk-|sk_|pk_|rk_|ghp_|gho_|ghs_|github_pat_|xox[abposr]-|AKIA|ASIA|AIza|glpat-)/.test(value)) return true;
  if (/^[\d -]+$/.test(value) && /^\d{13,19}$/.test(value.replace(/[ -]/g, ""))) return true;
  if (value.length >= 20 && !/\s/.test(value) && [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(p => p.test(value)).length >= 3) return true;
  return false;
}

export function maskedValue(value: string, element?: Element, max = 48): string {
  const chars = Array.from(value);
  if (isSecretElement(element) || looksSecretValue(value)) return `•••• (masked, ${chars.length} chars)`;
  return '"' + (chars.length > max ? chars.slice(0, max).join("") + `…" (${chars.length} chars)` : value + '"');
}

export type RowFacts = { app?: string; title?: string; element?: Element };
/** Call row: `Desktop · type textfield "Name" = "Ada" in TextEdit · Untitled`. */
export function callRow(args: any, facts: RowFacts = {}): string {
  const op = typeof args?.operation === "string" ? args.operation.slice(0, 16) : "action";
  const where = facts.app ? ` in ${facts.app}${facts.title ? " · " + Array.from(facts.title).slice(0, 60).join("") : ""}` : "";
  const element = facts.element ? `${facts.element.role.slice(0, 32)} "${Array.from(facts.element.name ?? "").slice(0, 60).join("")}"` : typeof args?.ref === "string" ? args.ref.slice(0, 32) : "";
  if (op === "snapshot") return `Desktop · snapshot${where}`;
  if (op === "press") return `Desktop · press ${typeof args?.key === "string" ? args.key.slice(0, 16) : "?"}${where}`;
  if (op === "type") return `Desktop · type ${element} = ${maskedValue(typeof args?.text === "string" ? args.text : "", facts.element)}${where}`;
  if (op === "scroll") return `Desktop · scroll ${element} ${String(args?.direction).slice(0, 8)} ×${Number(args?.amount) || "?"}${where}`;
  if (op === "read") return `Desktop · read ${element} ${args?.property === "value" ? "value" : "text"}${where}`;
  return `Desktop · ${op} ${element}${where}`;
}
