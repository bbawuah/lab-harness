import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute } from "node:path";

export type RegularShell = { executable: string; environment: Record<string, string> };

const piOnly = new Set(["LAB_WORKSPACE_API_KEY", "LAB_RELAY_RUN_REF", "PI_CODING_AGENT_DIR"]);
const internal = new Set(["_LAB_SHELL_UNSET", "_LAB_SHELL_EXECUTABLE"]);

/** Capture before applying Pi or Herdr isolation. Never read shell startup files. */
export function buildRegularShell(environment: NodeJS.ProcessEnv): RegularShell {
  const captured: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined || piOnly.has(name)) continue;
    if (internal.has(name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || value.includes("\0")) throw new Error("Invalid shell environment entry");
    captured[name] = value;
  }
  const executable = captured.SHELL ?? "/bin/sh";
  if (!isAbsolute(executable) || executable.includes("\0")) throw new Error("User shell must be an absolute executable path");
  try { if (!statSync(executable).isFile()) throw new Error(); accessSync(executable, constants.X_OK); }
  catch { throw new Error("User shell is not executable"); }
  return { executable, environment: captured };
}

// The source is constant. Only variable names are encoded in the unset list;
// captured values remain in the leaf environment, never in argv or files.
const wrapper = 'for name in $_LAB_SHELL_UNSET; do unset "$name"; done\nunset _LAB_SHELL_UNSET\nexecutable=$_LAB_SHELL_EXECUTABLE\nunset _LAB_SHELL_EXECUTABLE\nexec "$executable" -i';
export function shellLeaf(shell: RegularShell, cwd: string, inherited: NodeJS.ProcessEnv) {
  // Revalidate callers that construct RegularShell without the builder.
  const checked = buildRegularShell({ ...shell.environment, SHELL: shell.executable });
  const captured = { ...checked.environment };
  if (!("SHELL" in shell.environment)) delete captured.SHELL;
  const absent = new Set([...Object.keys(inherited), "HERDR", ...piOnly].filter(name => !(name in captured)));
  const env: Record<string, string> = { ...captured, _LAB_SHELL_UNSET: [...absent].join(" "), _LAB_SHELL_EXECUTABLE: shell.executable };
  return { type: "pane", label: "Terminal", cwd, command: ["/bin/sh", "-c", wrapper], env };
}
