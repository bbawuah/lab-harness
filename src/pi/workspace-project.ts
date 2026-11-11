/** The caller's directory is the workspace; --project explicitly overrides it. */
import { sep } from "node:path";
import { bindProjectRoot, type ProjectBinding } from "../project.ts";
import { LabError } from "../util.ts";
import { workspaceStatePath } from "./workspace-config.ts";

export async function selectWorkspaceProject(requested: string, _installRoot: string): Promise<ProjectBinding> {
  const project = bindProjectRoot(requested), state = workspaceStatePath();
  if (project.root === state || project.root.startsWith(state + sep)) throw new LabError("PROJECT_PRIVATE_STATE_REFUSED");
  return project;
}
