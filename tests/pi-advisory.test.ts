import { expect, test } from "bun:test";
import { registerAdvisoryBridge, type PiObservationAPI } from "../src/pi/advisory-extension.ts";
import { admission } from "../src/admission.ts";

function fixture() {
  const handlers = new Map<string, (event: any, ctx: any) => void>();
  const emitted: { name: string; data: any }[] = [];
  const pi: PiObservationAPI = {
    on(name, handler) { handlers.set(name, handler); return () => { handlers.delete(name); }; },
    events: { emit(name, data) { emitted.push({ name, data }); } },
  };
  const dispose = registerAdvisoryBridge(pi);
  const send = (name: string, event = {}, mode = "tui") => handlers.get(name)?.(event, { mode, model: { provider: "local-fixture", id: "no-model-call" }, isIdle: () => true });
  return { send, emitted, dispose, handlers };
}

test("FIXTURE Pi bridge pairs nested TUI prompts and omits private titles", () => {
  const f = fixture(); f.send("session_start");
  f.send("ui_prompt_start", { kind: "confirm", title: "PRIVATE fixture text" });
  f.send("ui_prompt_start", { kind: "input" });
  f.send("ui_prompt_end", { kind: "confirm" }); f.send("ui_prompt_end", { kind: "confirm" });
  f.send("session_shutdown");
  const blocked = f.emitted.filter(x => x.name === "herdr:blocked");
  expect(blocked.map(x => x.data.active)).toEqual([true, true, false, false]);
  expect(JSON.stringify(f.emitted)).not.toContain("PRIVATE"); f.dispose();
});
test("FIXTURE Pi bridge preserves aborted and actual selected model without acceptance", () => {
  const f = fixture(); f.send("session_start");
  f.send("model_select", { model: { provider: "fixture-other", id: "changed" } });
  f.send("agent_settled", { aborted: true });
  expect(f.emitted.at(-2)?.data.model).toEqual({ provider: "fixture-other", id: "changed" });
  expect(f.emitted.at(-1)?.data).toMatchObject({ kind: "agent-settled", aborted: true, authority: "advisory-only", nativeAdmission: "blocked-unqualified" });
  expect(admission().nativePi).toBe("blocked-unqualified"); f.dispose();
});
test("FIXTURE Pi bridge ignores RPC and unload clears exactly its pending prompt", () => {
  const f = fixture(); f.send("session_start", {}, "rpc"); f.send("ui_prompt_start", { kind: "confirm" }, "rpc");
  expect(f.emitted).toEqual([]);
  f.send("session_start"); f.send("ui_prompt_start", { kind: "custom" }); f.dispose(); f.dispose();
  expect(f.emitted.filter(x => x.name === "herdr:blocked").map(x => x.data.active)).toEqual([true, false]);
  expect(f.handlers.size).toBe(0);
});
