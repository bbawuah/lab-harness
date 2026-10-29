import { createHash } from "node:crypto";

export class LabError extends Error {
  constructor(readonly code: string) { super(code); this.name = "LabError"; }
}
export function requireThat(ok: unknown, code: string): asserts ok { if (!ok) throw new LabError(code); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const json = JSON.stringify(value); requireThat(json !== undefined, "INVALID_JSON"); return json;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
export const hash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export const textHash = (value: string): string => createHash("sha256").update(value).digest("hex");
export function record(value: unknown, code = "INVALID_OBJECT"): asserts value is Record<string, unknown> {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), code);
}
export function nonempty(value: unknown): asserts value is string { requireThat(typeof value === "string" && value.length > 0 && value.length <= 8192 && !value.includes("\0"), "INVALID_STRING"); }
export function digest(value: unknown): asserts value is string { requireThat(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "INVALID_HASH"); }
export function candidate(value: unknown): asserts value is { candidateSHA: string; dirtyHash: string } {
  record(value); requireThat(typeof value.candidateSHA === "string" && /^[a-f0-9]{40}$/.test(value.candidateSHA), "INVALID_CANDIDATE"); digest(value.dirtyHash);
}
export function equalCandidate(a: { candidateSHA: string; dirtyHash: string }, b: { candidateSHA: string; dirtyHash: string }): boolean {
  return a.candidateSHA === b.candidateSHA && a.dirtyHash === b.dirtyHash;
}
