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

const graphemes = (value: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), s => s.segment);
/** Typed value for rows and prompts; secret-looking values are masked. The count shows only when the value was cut. */
export function maskedValue(value: string, element?: Element, max = 48): string {
  const count = graphemes(value).length;
  if (isSecretElement(element) || looksSecretValue(value)) return `•••• (masked, ${count} chars)`;
  return '"' + oneLine(value, max) + '"' + (count > max ? ` (${count} chars)` : "");
}
/** Number of line breaks (each typed as Return) in a value. */
export const lineBreaks = (value: string) => (value.match(/\r\n|[\r\n\u2028\u2029\u0085\u000b\u000c]/g) ?? []).length;

/**
 * One display line from untrusted text: line breaks become a visible ⏎ (so a
 * window title or AX label cannot forge extra prompt lines, and typed newlines
 * are visible as Return), capped at `max` graphemes, each grapheme capped at 8
 * code points (stacked combining marks cannot paint over neighbouring lines).
 * Escaping of other controls happens in the renderer.
 */
export function oneLine(text: unknown, max = 60): string {
  const value = (typeof text === "string" ? text : String(text)).replace(/\r\n|[\r\n\u2028\u2029\u0085\u000b\u000c]/g, "⏎");
  const parts = graphemes(value).map(g => { const c = Array.from(g); return c.length > 8 ? c.slice(0, 8).join("") : g; });
  return parts.length > max ? parts.slice(0, max).join("") + "…" : parts.join("");
}

export type RowFacts = { app?: string; title?: string; element?: Element };
/** Call row: `Desktop · type textfield "Name" = "Ada" in TextEdit · Untitled`. */
export function callRow(args: any, facts: RowFacts = {}): string {
  const op = typeof args?.operation === "string" ? oneLine(args.operation, 16) : "action";
  const where = facts.app ? ` in ${oneLine(facts.app, 40)}${facts.title ? " · " + oneLine(facts.title) : ""}` : "";
  const element = facts.element ? `${oneLine(facts.element.role, 32)} "${oneLine(facts.element.name ?? "")}"` : typeof args?.ref === "string" ? oneLine(args.ref, 32) : "";
  if (op === "snapshot") return `Desktop · snapshot${where}`;
  if (op === "press") return `Desktop · press ${typeof args?.key === "string" ? oneLine(args.key, 16) : "?"}${where}`;
  if (op === "type") return `Desktop · type ${element} = ${maskedValue(typeof args?.text === "string" ? args.text : "", facts.element)}${where}`;
  if (op === "scroll") return `Desktop · scroll ${element} ${oneLine(String(args?.direction), 8)} ×${Number(args?.amount) || "?"}${where}`;
  if (op === "read") return `Desktop · read ${element} ${args?.property === "value" ? "value" : "text"}${where}`;
  return `Desktop · ${op} ${element}${where}`;
}
