/** Current user-facing commands. No network or private configuration is read. */
import { relayTools } from "./relay-extension.ts";
export const shellOptions = [
  ["--project DIR", "Open another existing project (paths with spaces work)."],
  ["--configure", "Change the saved endpoint, model and private key."],
  ["--single-pane", "Open only Pi, useful in a narrow terminal; no right-hand shell is started."],
  ["--offline", "Require cached runtime dependencies; model requests may still use the network."],
  ["--relay-group ID", "Use an explicitly configured cross-project Relay allowlist; default is project-only."],
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
    "Relay rows show message text and readable peer labels. Expand with native tool-output shortcut (default Ctrl+O); /hotkeys shows remaps. Full IDs/receipts remain in details.",
    "/lab-appearance — Preview light/dark/terminal mode, colors and spacing; Apply/Cancel/Reset.",
    "/lab-help — Show these LAB commands.",
    "/exit — Leave the workspace; native Pi /quit also works.",
    "Workspace panes: Ctrl+B then h/l changes focus; Tab cycles; z zooms; ? shows Herdr shortcuts.",
    "Tool-capable models receive lab_search, lab_files and relay_peers/send/inbox/ack automatically. Skills load only through your explicit command.",
    "Use native Pi /hotkeys for shortcuts; type / to browse native commands. Controlled LAB tasks remain unavailable.",
  ].join("\n");
}
export function shellHelp(): string {
  return ["LAB-HARNESS — interactive AI coding in your project",
    "Usage: lab [--project DIR] [--configure] [--single-pane] [--offline] [--relay-group ID] [--help]",
    "Run lab from a project; from home, choose an existing project folder.",
    "Default: fullscreen Pi on the left, your regular interactive shell on the right, both starting in the project.",
    ...shellOptions.map(([option, description]) => "  " + option + "  " + description),
    "Setup: local = self-hosted OpenAI-compatible endpoint (LAN/tailnet allowed); litellm = existing gateway.",
    "You provide the model server or service. Setup sends no model prompt and installs no weights.",
    "In Pi: /lab-help for LAB search/skills/Relay commands; /exit to leave.",
    "Guide: https://github.com/bbawuah/lab-harness/blob/main/docs/user-guide.md",
    "Controlled LAB task execution remains unavailable.",
  ].join("\n");
}
