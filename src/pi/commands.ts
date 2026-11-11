/** Current user-facing commands. No network or private configuration is read. */
import { relayTools } from "./relay-extension.ts";
export const shellOptions = [
  ["--project DIR", "Open another existing project (paths with spaces work)."],
  ["--configure", "Change the saved endpoint, model and private key."],
  ["--single-pane", "Open only Pi, useful in a narrow terminal; no right-hand shell is started."],
  ["--offline", "Require cached runtime dependencies; model requests may still use the network."],
  ["--relay-group ID", "Use an explicitly configured cross-project Relay allowlist; default is project-only."],
  ["--setup-browser", "Explicitly acquire the optional pinned browser control tool; --offline requires cache."],
  ["--browser URL", "Start an owned ephemeral browser bound to this HTTP(S) origin."],
  ["--browser-executable PATH", "Use an existing approved same-OS browser executable."],
  ["--mode MODE", "Permission mode: ask (default), edits, read-only or auto. Change it in Pi with /lab-mode."],
  ["--help", "Show this help without starting Pi or a model request."],
] as const;
export const workspaceCommands = [
  { name: "lab-search", action: "search", usage: "TEXT", description: "Find literal project text with source hashes.", modelTool: "lab_search" },
  { name: "lab-files", action: "files", usage: "NAME", description: "Find project filenames with source hashes.", modelTool: "lab_files" },
  { name: "lab-skills", action: "skills", usage: "", description: "List skills and exact IDs; does not load instructions." },
  { name: "lab-skill", action: "load", usage: "ID [ORIGIN PATH]", description: "Explicitly load a listed skill after rechecking its bytes." },
] as const;

export function workspaceHelp(): string {
  return ["LAB-HARNESS commands",
    ...workspaceCommands.map(command => "/" + command.name + (command.usage ? " " + command.usage : "") + " — " + command.description),
    ...relayTools.map(tool => "/relay-" + tool.action + " " + tool.usage + " — " + tool.description),
    "/lab-appearance — Preview light/dark/terminal mode, colors and spacing; Apply/Cancel/Reset.",
    "/lab-browser status|close — Inspect or close this run’s owned browser; start with --browser URL.",
    "/lab-mode [ask|edits|read-only|auto|next] — Show or change the permission mode (footer shows it).",
    "/agents — List spawned agents and their Herdr tabs; ask the model to spawn or stop a child.",
    "/relay-auto [on|off] — Automatically respond to incoming messages when idle (on by default).",
    "/lab-help — Show these LAB commands.",
    "/exit — Leave the workspace; native Pi /quit also works.",
    "Workspace panes: Ctrl+B then h/l changes focus; Tab cycles; z zooms; ? shows Herdr shortcuts.",
    "Tool-capable models receive lab_search, lab_files and relay_peers/send/inbox/ack plus agent_spawn/list/stop automatically. Skills load only through your explicit command.",
    "Use native Pi /hotkeys for shortcuts; type / to browse native commands. Controlled LAB tasks remain unavailable.",
  ].join("\n");
}
/** One Usage line generated from shellOptions; the ./lab shell launcher carries the same text (tested). */
export function shellUsage(): string {
  return "Usage: lab " + shellOptions.map(([option]) => "[" + option + "]").join(" ");
}
export function shellHelp(): string {
  return ["LAB-HARNESS — interactive AI coding in your project",
    shellUsage(),
    "       lab update [--help] — Update the published pinned release without opening a chat.",
    "Run lab from a project; from home, choose an existing project folder.",
    "Default: fullscreen Pi on the left, your regular interactive shell on the right, both starting in the project.",
    ...shellOptions.map(([option, description]) => "  " + option + "  " + description),
    "Permission modes: ask confirms every edit, write, shell command, browser change and Relay send; edits",
    "auto-approves file edits inside the project; read-only refuses changes; auto asks nothing (explicit opt-in).",
    "Setup: anthropic/openai = direct API key; local = self-hosted OpenAI-compatible endpoint (LAN/tailnet allowed); litellm = existing gateway.",
    "You provide the model server or service. Setup sends no model prompt and installs no weights.",
    "In Pi: /lab-help for LAB search/skills/Relay commands; /exit to leave.",
    "Guide: https://github.com/bbawuah/lab-harness/blob/main/docs/user-guide.md",
    "Controlled LAB task execution remains unavailable.",
  ].join("\n");
}
