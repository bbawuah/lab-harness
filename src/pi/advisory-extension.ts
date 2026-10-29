/** Opt-in Pi TUI observations. This extension does not admit requests or accept tasks. */
type Context = { mode?: string; model?: { provider?: string; id?: string }; isIdle?: () => boolean };
type Event = { kind?: string; aborted?: boolean; model?: { provider?: string; id?: string } };
export type PiObservationAPI = {
  on(name: string, handler: (event: Event, ctx: Context) => void): () => void;
  events: { emit(name: string, data: unknown): void };
};

export function registerAdvisoryBridge(pi: PiObservationAPI): () => void {
  let tui = false;
  const pending = new Map<string, number>();
  const subscriptions: (() => void)[] = [];
  const observe = (data: Record<string, unknown>): void => pi.events.emit("lab:pi-observation", {
    schemaVersion: 1, authority: "advisory-only", nativeAdmission: "blocked-unqualified", ...data,
  });
  const clear = (): void => {
    for (const count of pending.values()) for (let i = 0; i < count; i++) pi.events.emit("herdr:blocked", { active: false });
    pending.clear();
  };
  const model = (value: Context["model"]) => value ? { provider: value.provider, id: value.id } : null;
  subscriptions.push(pi.on("session_start", (_event, ctx) => {
    clear(); tui = ctx.mode === "tui";
    if (tui) observe({ kind: "session-start", model: model(ctx.model) });
  }));
  subscriptions.push(pi.on("model_select", (event, ctx) => {
    if (tui && ctx.mode === "tui") observe({ kind: "model-selected", model: model(event.model) });
  }));
  subscriptions.push(pi.on("ui_prompt_start", (event, ctx) => {
    if (!tui || ctx.mode !== "tui") return;
    const kind = ["select", "confirm", "input", "editor", "custom"].includes(event.kind ?? "") ? event.kind! : "custom";
    pending.set(kind, (pending.get(kind) ?? 0) + 1);
    // Native prompt titles can contain private text; only the prompt kind is forwarded.
    pi.events.emit("herdr:blocked", { active: true, label: `Pi ${kind}` });
  }));
  subscriptions.push(pi.on("ui_prompt_end", (event, ctx) => {
    if (!tui || ctx.mode !== "tui") return;
    const kind = ["select", "confirm", "input", "editor", "custom"].includes(event.kind ?? "") ? event.kind! : "custom";
    const count = pending.get(kind) ?? 0;
    if (!count) return;
    if (count === 1) pending.delete(kind); else pending.set(kind, count - 1);
    pi.events.emit("herdr:blocked", { active: false });
  }));
  subscriptions.push(pi.on("agent_settled", (event, ctx) => {
    if (tui && ctx.mode === "tui") observe({ kind: "agent-settled", aborted: event.aborted === true, idle: ctx.isIdle?.() === true });
  }));
  subscriptions.push(pi.on("session_shutdown", () => { clear(); tui = false; }));
  return () => { clear(); tui = false; for (const unsubscribe of subscriptions) unsubscribe(); };
}

export default function (pi: PiObservationAPI): void { registerAdvisoryBridge(pi); }
