/** Select a project before route/state creation or native Pi discovery. */
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { bindProjectRoot, type ProjectBinding } from "../project.ts";
import { LabError } from "../util.ts";
import { workspaceStatePath } from "./workspace-config.ts";

const contains = (parent: string, child: string) => parent === child || child.startsWith(parent + sep);
function checkProject(path: string, installRoot: string): ProjectBinding {
  const project = bindProjectRoot(path), home = resolve(homedir()), state = workspaceStatePath();
  if (contains(project.root, home)) throw new LabError("PROJECT_HOME_REFUSED");
  for (const application of [resolve(installRoot), state]) {
    if (contains(project.root, application) || contains(application, project.root)) throw new LabError("PROJECT_APPLICATION_OVERLAP");
  }
  return project;
}

export async function selectWorkspaceProject(requested: string, installRoot: string): Promise<ProjectBinding> {
  try { return checkProject(requested, installRoot); }
  catch (error) {
    // Missing/invalid --project inputs remain errors. Only an unsafe broad or
    // application directory needs the guided first-run choice.
    if (!(error instanceof LabError) || !["PROJECT_HOME_REFUSED", "PROJECT_APPLICATION_OVERLAP"].includes(error.code)) throw error;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new LabError("PROJECT_SELECTION_REQUIRES_TTY");
  process.stdout.write("Choose a project folder before LAB starts. Your home folder and folders containing LAB's installation or private state cannot be the project.\nUse an existing code/project folder, for example ~/Projects/my-app. LAB will not search your home folder.\nEnter a path without shell quotes; spaces are supported. Relative paths start from your original folder. Blank, Ctrl-C or Ctrl-D cancels.\n");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 0 });
  rl.on("SIGINT", () => rl.close());
  try {
    process.stdout.write("Project directory: ");
    for await (const line of rl) {
      const answer = line.trim();
      if (!answer) throw new LabError("PROJECT_SELECTION_CANCELLED");
      const path = answer === "~" ? homedir() : answer.startsWith("~/") ? resolve(homedir(), answer.slice(2)) : resolve(requested, answer);
      try { return checkProject(path, installRoot); }
      catch (error) {
        if (error instanceof Error && error.message.startsWith("LAB_WORKSPACE_STATE_ROOT")) throw error;
        process.stdout.write("Choose an existing project directory outside LAB's release/state folders. Home, filesystem roots, missing directories and symlink directories are refused.\nProject directory: ");
      }
    }
    throw new LabError("PROJECT_SELECTION_CANCELLED");
  } finally { rl.close(); }
}
