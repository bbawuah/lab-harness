/** Test-only display activity. Never register or call a model/provider. */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

type Context = {
  cwd: string; model: any; modelRegistry: { getAvailable(): unknown[]; find(provider: string, id: string): unknown };
  ui: { getEditorText(): string; setStatus(key: string, text: string): void };
  shutdown(): void;
};
type API = {
  on(event: string, handler: (event: any, ctx: Context) => any): unknown;
  sendMessage(message: { customType: string; content: string; display: boolean }, options: { triggerTurn: false }): void;
};

export default function fullscreenFixture(pi: API): void {
  const root = process.env.LAB_FULLSCREEN_RUN!;
  if (!root || process.cwd() !== join(root, "project")) process.exit(85);
  let ctx: Context, timer: ReturnType<typeof setInterval> | undefined;
  let seq = 0, messages = 0, handled = 0, agentEvents = 0, providerEvents = 0;
  let lastInput = "";
  const noRoutableModel = () => ctx?.model === undefined || (ctx?.model?.id === "unknown" &&
    ctx.model.provider === "unknown" && ctx.model.api === "unknown" && ctx.model.baseUrl === "" &&
    ctx.model.contextWindow === 0 && ctx.model.maxTokens === 0 && ctx.modelRegistry.find("unknown", "unknown") === undefined);
  const state = () => ({ seq, messages, handled, lastInput, agentEvents, providerEvents,
    noRoutableModel: noRoutableModel(),
    selectedModel: ctx?.model === undefined ? null : { type: typeof ctx?.model, nullValue: ctx?.model === null,
      id: ctx?.model?.id, provider: ctx?.model?.provider, api: ctx?.model?.api, baseUrl: ctx?.model?.baseUrl },
    availableModels: ctx?.modelRegistry.getAvailable().length ?? -1,
    draft: ctx?.ui.getEditorText() ?? "", cwdMatches: ctx?.cwd === join(root, "project") });
  function ack(extra: object = {}) {
    const path = join(root, "ack.json");
    writeFileSync(path + ".next", JSON.stringify({ ...state(), ...extra }));
    renameSync(path + ".next", path);
  }
  function fatal(reason: string): never { ack({ fatal: reason }); process.exit(86); }
  pi.on("before_agent_start", () => { agentEvents++; fatal("agent turn forbidden"); });
  pi.on("before_provider_request", () => { providerEvents++; fatal("provider request forbidden"); });
  pi.on("input", event => {
    handled++; lastInput = String(event.text); ack(); return { action: "handled" };
  });
  pi.on("session_start", (_event, context) => {
    ctx = context;
    if (!noRoutableModel() || ctx.modelRegistry.getAvailable().length !== 0 || !state().cwdMatches) fatal("no-model/cwd invariant");
    ctx.ui.setStatus("fullscreen-fixture", "FIXTURE NO MODEL");
    ack({ ready: true });
    timer = setInterval(() => {
      try {
        const bytes = readFileSync(join(root, "control.json"));
        if (bytes.length > 4096) fatal("oversized control");
        const request = JSON.parse(bytes.toString());
        if (!Number.isSafeInteger(request.seq) || request.seq <= seq) return;
        if (request.seq !== seq + 1) fatal("control sequence");
        seq = request.seq;
        if (request.action === "append") {
          if (!Number.isInteger(request.count) || request.count < 1 || messages + request.count > 200) fatal("append bound");
          for (let i = 0; i < request.count; i++) {
            messages++;
            pi.sendMessage({ customType: "fullscreen-synthetic", display: true,
              content: `TRANSCRIPT_${String(messages).padStart(3, "0")} synthetic display only | wrapping text 漢字 e\u0301 | ${"bounded words ".repeat(5)}` }, { triggerTurn: false });
          }
        } else if (request.action === "quit") {
          clearInterval(timer); ack({ shutdownRequested: true }); ctx.shutdown(); return;
        } else if (request.action !== "inspect") fatal("unknown control action");
        if (!noRoutableModel() || ctx.modelRegistry.getAvailable().length !== 0) fatal("model appeared");
        ack();
      } catch (error: any) {
        if (error?.code !== "ENOENT") fatal("control parse/read failure");
      }
    }, 25);
  });
  pi.on("session_shutdown", () => { clearInterval(timer); ack({ shutdown: true }); });
}
