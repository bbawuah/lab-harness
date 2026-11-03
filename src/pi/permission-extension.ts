/**
 * LAB approval gate on Pi's supported `tool_call` extension event (pinned Pi
 * 1.4.0 types.ts:1250–1265). A block becomes an error tool result for the model
 * (agent-loop.ts:718–785). Every failure path denies. See docs/permission-modes-contract.md.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { wrapColumns } from "./display.ts";
import { indicatorSlots, setIndicator, type IndicatorState } from "./status-indicator.ts";
import { reservedFamilyTools, approvalChoices, approvalTitle, autoChoices, autoStartWarning, autoSummary, classify, decide, denial, describeApproval, describeFamilyApproval, modeCycle, modeDescriptions, parseMode, permissionModes, resolveTargetPath, type BrowserFacts, type GatedFamily, type PathRoots, type PermissionMode } from "./permission.ts";

export type PermissionUI = {
  select(title: string, options: string[], opts?: { signal?: AbortSignal }): Promise<string | undefined>;
  input(title: string, placeholder?: string, opts?: { signal?: AbortSignal }): Promise<string | undefined>;
  notify(message: string, kind?: "info" | "warning" | "error"): void;
  setStatus?(key: string, text: string | undefined): void;
};
export type PermissionContext = { hasUI?: boolean; mode?: string; cwd?: string; signal?: AbortSignal; ui: PermissionUI };
export type ToolCallEvent = { type: "tool_call"; toolName: string; toolCallId: string; input: Record<string, unknown> };
export type PermissionAPI = {
  on(name: "tool_call", handler: (event: ToolCallEvent, ctx: PermissionContext) => Promise<{ block: true; reason: string } | undefined>): unknown;
  on(name: "session_start", handler: (event: { reason?: string }, ctx: PermissionContext) => void): unknown;
  registerCommand(name: string, options: { description: string; handler(args: string, ctx: PermissionContext): Promise<void> }): void;
};
export type PermissionOptions = {
  statePath?: string; projectRoot?: string; excluded?: string[];
  browser?: (input: Record<string, unknown>) => BrowserFacts | undefined;
  columns?: () => number;
};

/** Footer chip for the mode: "● mode: ask · /lab-mode"; auto uses the attention glyph. */
export const modeIndicator = (mode: PermissionMode): IndicatorState => ({ glyph: mode === "auto" ? "!" : "●", label: `mode: ${mode}`, detail: "· /lab-mode" });
/** Reads the private LAB mode file. Anything unexpected falls back to ask. */
export function readModeFile(path: string | undefined): PermissionMode {
  if (!path) return "ask";
  // Check and read the same fd: O_NONBLOCK so a FIFO swapped in after any check cannot freeze Pi.
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const entry = fstatSync(fd);
    if (!entry.isFile() || entry.uid !== process.getuid?.() || (entry.mode & 0o077) !== 0 || entry.size > 256) return "ask";
    return parseMode(JSON.parse(readFileSync(fd, "utf8"))?.mode) ?? "ask";
  } catch { return "ask"; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}
/** Writes the mode without following symlinks; mode 0600. */
export function writeModeFile(path: string, mode: PermissionMode): void {
  // O_NONBLOCK: a FIFO planted at the path fails (ENXIO) instead of freezing Pi's event loop.
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const entry = fstatSync(fd);
    if (!entry.isFile() || entry.uid !== process.getuid?.() || (entry.mode & 0o077) !== 0) throw new Error("LAB_PERMISSION_STATE");
    writeSync(fd, JSON.stringify({ mode }) + "\n");
  } finally { closeSync(fd); }
}

export function permissionOptionsFromEnvironment(env: NodeJS.ProcessEnv = process.env): PermissionOptions {
  const agent = env.LAB_WORKSPACE_AGENT_DIR;
  return {
    statePath: env.LAB_PERMISSION_STATE,
    projectRoot: env.LAB_WORKSPACE_ROOT,
    // Never auto-approve writes into LAB's own run/state/install roots, even under the project.
    excluded: [agent ? dirname(agent) : undefined, env.LAB_WORKSPACE_STATE_DIR, env.LAB_INSTALL_ROOT].filter((path): path is string => !!path),
  };
}

export function installPermissionExtension(pi: PermissionAPI, options: PermissionOptions = permissionOptionsFromEnvironment()) {
  // In-memory mode is authoritative. /reload re-imports this module in the same Pi
  // process, so the mode is kept in a process-global slot keyed by the state file;
  // the file is trusted only on the first load of a launch. A file changed by
  // anything else (an approved command, another process) is ignored and restored.
  const memory: Map<string, PermissionMode> = ((globalThis as any)[Symbol.for("lab.permission.modes")] ??= new Map());
  let mode = readModeFile(options.statePath);
  let ignoredFileChange = false;
  if (options.statePath) {
    const kept = memory.get(options.statePath);
    if (kept && kept !== mode) { ignoredFileChange = true; mode = kept; try { writeModeFile(options.statePath, kept); } catch {} }
    else if (kept) mode = kept;
    memory.set(options.statePath, mode);
  }
  const grants = new Set<string>();
  const families = new Map<string, GatedFamily>();
  // Tools LAB already classifies; a family may not take them over.
  const builtIn = new Set(["read", "grep", "find", "ls", "edit", "write", "bash", "lab_search", "lab_files", "lab_browser", "relay_peers", "relay_send", "relay_inbox", "relay_ack"]);
  /** Lets another tool family (e.g. agent-desktop) use this gate. Throws on a name collision. */
  const registerFamily = (family: GatedFamily) => {
    if (!family || typeof family.family !== "string" || !family.family || !Array.isArray(family.tools) || typeof family.describe !== "function" || typeof family.sessionGrants !== "boolean" || (family.inAuto !== "run" && family.inAuto !== "ask") || (family.denyWithNote !== undefined && typeof family.denyWithNote !== "boolean") || (family.onApproved !== undefined && typeof family.onApproved !== "function")) throw new Error("LAB_PERMISSION_FAMILY: invalid family");
    // "Desktop" names only the family holding the reserved tool, so the auto confirm can't read two ways.
    if (family.family.normalize("NFKC").toLowerCase().trim() === "desktop" && !family.tools.some(tool => reservedFamilyTools.has(tool))) throw new Error("LAB_PERMISSION_FAMILY: the name Desktop is reserved for lab_desktop");
    // The reserved desktop tool must use the alwaysAsk policy (lead: "Desktop policy: alwaysAsk + onApproved").
    if (family.tools.some(tool => reservedFamilyTools.has(tool)) && (family.sessionGrants !== false || family.inAuto !== "ask" || family.denyWithNote !== false)) throw new Error("LAB_PERMISSION_FAMILY: lab_desktop must use the alwaysAsk policy");
    for (const tool of family.tools) if (typeof tool !== "string" || builtIn.has(tool) || families.has(tool)) throw new Error(`LAB_PERMISSION_FAMILY: ${String(tool).slice(0, 64)} is already gated`);
    const frozen = Object.freeze({ ...family, tools: Object.freeze([...family.tools]) });
    for (const tool of frozen.tools) families.set(tool, frozen);
  };
  let queue: Promise<unknown> = Promise.resolve();
  // Shared footer chip (status-indicator.ts). Key lab-mode sorts first, so Pi's
  // right-side footer truncation never cuts the mode (longest text: 29 columns).
  const status = (ctx: PermissionContext) => { try { setIndicator(ctx.ui, indicatorSlots.mode, modeIndicator(mode)); } catch {} };
  const setMode = (next: PermissionMode, ctx: PermissionContext) => {
    // Memory is authoritative; the file only seeds the first load. A file the model
    // broke (bash can see LAB_PERMISSION_STATE) must not stop the operator changing mode.
    mode = next; grants.clear();
    let written = true;
    if (options.statePath) { memory.set(options.statePath, next); try { writeModeFile(options.statePath, next); } catch { written = false; } }
    status(ctx);
    ctx.ui.notify(`LAB mode: ${next} — ${modeDescriptions[next]}.`, next === "auto" ? "warning" : "info");
    if (!written) ctx.ui.notify("LAB mode changed for this session, but its private mode file could not be written (it was changed outside LAB).", "warning");
  };

  pi.on("session_start", (event, ctx) => {
    // Grants never cross sessions; /reload re-creates this extension and starts empty too.
    if (event?.reason !== "startup") grants.clear();
    status(ctx);
    // The `lab --mode auto` stdout warning is erased by the full-screen TUI; repeat it in Pi.
    if (event?.reason === "startup" && mode === "auto") { try { ctx.ui.notify(autoStartWarning(), "warning"); } catch {} }
    if (ignoredFileChange) { ignoredFileChange = false; try { ctx.ui.notify(`LAB ignored a change to its mode file made outside /lab-mode; the mode stays ${mode}.`, "warning"); } catch {} }
  });

  /** Entering auto needs one explicit confirm that names what auto skips. Anything else keeps the mode. */
  async function confirmAuto(ctx: PermissionContext): Promise<boolean> {
    if (mode === "auto") return true;
    if (!ctx.hasUI) { ctx.ui.notify("LAB mode not changed: switching to auto needs a confirmation in the interactive UI (or start with lab --mode auto).", "warning"); return false; }
    const width = Math.max(20, (options.columns?.() ?? process.stdout.columns ?? 80) - 2);
    const title = [`LAB: switch from ${mode} to auto?`, autoSummary([...new Set(families.values())]), "Approved actions run as you; this is not a sandbox."].flatMap(row => wrapColumns(row, width)).join("\n");
    let choice: string | undefined;
    try { choice = await ctx.ui.select(title, [...autoChoices], { signal: ctx.signal }); } catch { choice = undefined; }
    if (choice === "Switch to auto") return true;
    ctx.ui.notify(`LAB mode not changed: still ${mode}.`, "info"); return false;
  }

  pi.registerCommand("lab-mode", { description: "Show or change the LAB permission mode (ask, edits, read-only, auto)", async handler(args, ctx) {
    const value = args.trim();
    try {
      if (value === "next") return setMode(modeCycle[mode], ctx);
      if (value) {
        const next = parseMode(value);
        if (!next) return ctx.ui.notify(`Unknown mode "${value.slice(0, 32)}". Use ask, edits, read-only or auto.`, "error");
        if (next === "auto" && !await confirmAuto(ctx)) return;
        return setMode(next, ctx);
      }
      if (!ctx.hasUI) return ctx.ui.notify(`LAB mode: ${mode}`, "info");
      const labels = permissionModes.map(m => `${m}${m === mode ? " (current)" : ""} — ${modeDescriptions[m]}`);
      let choice: string | undefined;
      try { choice = await ctx.ui.select(`LAB permission mode (current: ${mode})`, labels); } catch { return ctx.ui.notify(`LAB mode not changed: still ${mode}.`, "info"); }
      const picked = choice ? permissionModes[labels.indexOf(choice)] : undefined;
      if (picked && picked !== mode && (picked !== "auto" || await confirmAuto(ctx))) setMode(picked, ctx);
    } catch { ctx.ui.notify("LAB mode was not changed: its private state could not be written.", "error"); }
  } });

  async function ask(event: ToolCallEvent, ctx: PermissionContext): Promise<{ block: true; reason: string } | undefined> {
    const cwd = ctx.cwd ?? options.projectRoot ?? process.cwd();
    const roots: PathRoots = { project: options.projectRoot ?? cwd, excluded: options.excluded ?? [] };
    const family = families.get(event.toolName);
    const approval = family ? describeFamilyApproval(family, event.toolName, event.input)
      : describeApproval(event.toolName, event.input, { cwd, roots, browser: options.browser, fileSize: path => { try { const s = statSync(path); return s.isFile() ? s.size : undefined; } catch { return undefined; } } });
    if (approval.sessionGrants !== false && grants.has(approval.scope)) return undefined;
    if (!ctx.hasUI || ctx.mode !== "tui") return { block: true, reason: denial(event.toolName, "no interactive approval is available, so LAB denied it") };
    if (ctx.signal?.aborted) return { block: true, reason: denial(event.toolName, "the turn was cancelled") };
    const width = Math.max(20, (options.columns?.() ?? process.stdout.columns ?? 80) - 2);
    const choices = approvalChoices(approval);
    const choice = await ctx.ui.select(approvalTitle(approval, mode, width), [...choices], { signal: ctx.signal });
    if (choice === "Allow once") return undefined;
    if (approval.sessionGrants !== false && choice === choices[1]) { grants.add(approval.scope); return undefined; }
    if (approval.denyWithNote !== false && choice === "Deny with note…") {
      let note: string | undefined;
      try { note = await ctx.ui.input("Note for the model (optional)", "why it was denied, or what to do instead", { signal: ctx.signal }); } catch {}
      return { block: true, reason: denial(event.toolName, "the user denied it", note) };
    }
    return { block: true, reason: denial(event.toolName, choice === "Deny" ? "the user denied it" : "the approval was dismissed") };
  }

  pi.on("tool_call", async (event, ctx) => {
    const toolName = typeof event?.toolName === "string" ? event.toolName : "tool";
    try {
      const input = event.input && typeof event.input === "object" ? event.input : {};
      const family = families.get(toolName);
      const klass = classify(toolName, input, family);
      const inside = klass === "edit" && mode === "edits"
        ? resolveTargetPath(input.path, ctx.cwd ?? options.projectRoot ?? process.cwd(), { project: options.projectRoot ?? ctx.cwd ?? process.cwd(), excluded: options.excluded ?? [] }).inside
        : false;
      const decision = decide(mode, toolName, klass, inside, family);
      // A family may bind each allowed mutation (e.g. a single-use token for this
      // toolCallId and input). If it cannot, the call is denied.
      const approved = (outcome: { block: true; reason: string } | undefined) => {
        if (outcome || klass !== "family" || !family?.onApproved) return outcome;
        try { family.onApproved(event.toolCallId, toolName, input); return undefined; }
        catch { return { block: true as const, reason: denial(toolName, "the tool family could not record the approval, so LAB denied it") }; }
      };
      if (decision.kind === "run") return approved(undefined);
      if (decision.kind === "refuse") return { block: true, reason: decision.reason };
      // One prompt at a time; a failed prompt never blocks later ones.
      const result = queue.then(() => ask({ ...event, toolName, input }, ctx));
      queue = result.catch(() => {});
      return approved(await result);
    } catch {
      return { block: true, reason: denial(toolName, "the approval prompt failed, so LAB denied it") };
    }
  });
  return { get mode() { return mode; }, grants, registerFamily };
}
