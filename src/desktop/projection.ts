/**
 * Strict parsing of agent-desktop 1.0.2 JSON envelopes (output version 2.5)
 * and projection to the small model-facing shape. Anything malformed,
 * oversized or from a different envelope version is refused, never sliced.
 */
import { isSecure } from "./display.ts";
export function insist(value: unknown, code = "LAB_DESKTOP_RESPONSE"): asserts value { if (!value) throw new Error(code); }
const record = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, max = 2000) => typeof x === "string" && x.length <= max;

export type Delivery = "not_delivered" | "delivered_unverified" | "delivered_verified" | "delivery_uncertain" | "unknown";
export type Disposition = { delivery: Delivery; retry: "safe" | "unsafe" | "unknown" };
export type DesktopError = { code: string; message: string; disposition?: Disposition };
export type Envelope = { ok: true; command: string; data: any } | { ok: false; command: string; error: DesktopError };

const deliveries = new Set(["not_delivered", "delivered_unverified", "delivered_verified", "delivery_uncertain", "unknown"]);
function disposition(x: unknown): Disposition | undefined {
  if (x === undefined) return undefined;
  insist(record(x) && deliveries.has(x.delivery) && ["safe", "unsafe", "unknown"].includes(x.retry));
  return { delivery: x.delivery, retry: x.retry };
}
/** Only an explicit not_delivered + safe disposition proves that nothing happened. */
export const provablyNotDelivered = (d?: Disposition) => d?.delivery === "not_delivered" && d.retry === "safe";

export function envelope(raw: string, command: string): Envelope {
  insist(Buffer.byteLength(raw) <= 256 * 1024, "LAB_DESKTOP_OUTPUT_LIMIT");
  const lines = raw.split("\n").filter(Boolean);
  insist(lines.length === 1);
  let o: any; try { o = JSON.parse(lines[0]!); } catch { throw new Error("LAB_DESKTOP_RESPONSE"); }
  insist(record(o) && o.version === "2.5" && o.command === command && typeof o.ok === "boolean");
  if (o.ok) { insist(!("error" in o) && "data" in o); return { ok: true, command, data: o.data }; }
  const e = o.error; insist(record(e) && text(e.code, 64) && /^[A-Z_]+$/.test(e.code) && typeof e.message === "string");
  return { ok: false, command, error: { code: e.code, message: e.message.slice(0, 400), disposition: disposition(e.disposition) } };
}

export type PermissionState = "granted" | "denied" | "not_required" | "unknown";
export function permissions(data: any): { accessibility: PermissionState; screenRecording: PermissionState; automation: PermissionState } {
  const state = (x: any): PermissionState => { insist(record(x) && ["granted", "denied", "not_required", "unknown"].includes(x.state)); return x.state; };
  insist(record(data));
  return { accessibility: state(data.accessibility), screenRecording: state(data.screen_recording), automation: state(data.automation) };
}

export type WindowInfo = { id: string; title: string; app: string; pid: number; focused: boolean; accessible: boolean };
export function windows(data: any): WindowInfo[] {
  insist(Array.isArray(data) && data.length <= 500);
  return data.map((w: any) => {
    insist(record(w) && text(w.id, 64) && /^w-[0-9A-Za-z_-]+$/.test(w.id) && text(w.title, 1000) && text(w.app_name, 200) && w.app_name.length > 0 && Number.isInteger(w.pid) && w.pid > 1 && typeof w.is_focused === "boolean");
    insist(w.accessible === undefined || typeof w.accessible === "boolean");
    return { id: w.id, title: w.title, app: w.app_name, pid: w.pid, focused: w.is_focused, accessible: w.accessible !== false };
  });
}

export type Element = { role: string; name?: string; value?: string; states?: string[] };
export type Node = Element & { ref?: string; description?: string; children?: Node[]; childrenCount?: number; truncated?: boolean };
export const REF = /^@(s[0-9a-z]{4,32}):e([0-9]{1,6})$/;
const MAX_NODES = 2000, MAX_DEPTH = 32;

/** Snapshot of exactly the bound window; returns refs owned by this snapshot id. */
export function snapshot(data: any, expect: { app: string; windowId: string }) {
  insist(record(data) && record(data.window) && typeof data.snapshot_id === "string" && /^s[0-9a-z]{4,32}$/.test(data.snapshot_id) && typeof data.complete === "boolean");
  insist(data.app === expect.app && data.window.id === expect.windowId, "LAB_DESKTOP_WINDOW_MISMATCH: the snapshot was not of the bound window; nothing was done.");
  const id = data.snapshot_id as string;
  const refs = new Map<string, Element>(); let count = 0;
  const walk = (n: any, depth: number): Node => {
    insist(record(n) && ++count <= MAX_NODES && depth <= MAX_DEPTH, "LAB_DESKTOP_OUTPUT_LIMIT");
    insist(text(n.role, 64));
    const out: Node = { role: n.role };
    for (const [k, v] of [["name", n.name], ["value", n.value], ["description", n.description]] as const) {
      if (v === undefined || v === null) continue; insist(text(v, 4000)); (out as any)[k] = v;
    }
    if (n.states !== undefined) { insist(Array.isArray(n.states) && n.states.length <= 32 && n.states.every((s: unknown) => text(s, 64))); out.states = n.states; }
    // Secure text fields (AXSecureTextField) are never readable: drop any value the tool reported.
    if (isSecure(out)) delete out.value;
    if (n.ref_id !== undefined) {
      const m = REF.exec(n.ref_id); insist(m && m[1] === id && !refs.has(n.ref_id));
      out.ref = n.ref_id; refs.set(n.ref_id, { role: out.role, name: out.name, value: out.value, states: out.states });
    }
    if (n.children_count !== undefined) { insist(Number.isInteger(n.children_count) && n.children_count >= 0); out.childrenCount = n.children_count; }
    if (n.subtree_truncated === true) out.truncated = true;
    if (n.children !== undefined) { insist(Array.isArray(n.children)); out.children = n.children.map((c: any) => walk(c, depth + 1)); }
    return out;
  };
  const tree = walk(data.tree, 0);
  insist(!Number.isInteger(data.ref_count) || data.ref_count === refs.size);
  insist(text(data.window.title, 1000));
  return { snapshotId: id, complete: data.complete as boolean, window: { id: data.window.id as string, title: data.window.title as string }, tree, refs };
}

/** Successful ref action; disposition is mandatory and must be a recognized value. */
export function action(data: any) {
  insist(record(data) && text(data.action, 64));
  const d = disposition(data.disposition); insist(d);
  const surfaces = Array.isArray(data.surfaces) ? data.surfaces.slice(0, 16).map((s: any) => (record(s) && text(s.kind, 32) ? s.kind : "unknown")) : [];
  return { action: data.action as string, delivery: d.delivery, retry: d.retry, openSurfaces: surfaces as string[] };
}

export function property(data: any, ref: string, name: "text" | "value") {
  insist(record(data) && data.ref === ref && data.property === name);
  const v = data.value; insist(v === null || text(v, 16000) || typeof v === "number" || typeof v === "boolean");
  return { ref, property: name, value: v as string | number | boolean | null };
}
