import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, parse, resolve } from "node:path";
import { requireThat } from "./util.ts";

/** Explicit working-directory binding, not a native Pi filesystem sandbox. */
export type ProjectBinding = { root: string; device: number; inode: number };

export function bindProjectRoot(path: string): ProjectBinding {
  requireThat(typeof path === "string" && path.length > 0 && !path.includes("\0"), "PROJECT_DIRECTORY_REQUIRED");
  const requested = resolve(path), entry = lstatSync(requested);
  requireThat(entry.isDirectory() && !entry.isSymbolicLink(), "INVALID_PROJECT_DIRECTORY");
  const root = realpathSync(requested), stat = lstatSync(root);
  requireThat(root !== parse(root).root, "PROJECT_FILESYSTEM_ROOT_REFUSED");
  return { root, device: stat.dev, inode: stat.ino };
}

export function verifyProjectBinding(value: unknown): ProjectBinding {
  const binding = value as ProjectBinding;
  requireThat(binding !== null && typeof binding === "object" && Object.keys(binding).sort().join(",") === "device,inode,root" &&
    typeof binding.root === "string" && isAbsolute(binding.root) && resolve(binding.root) === binding.root &&
    Number.isSafeInteger(binding.device) && Number.isSafeInteger(binding.inode), "INVALID_PROJECT_BINDING");
  const current = bindProjectRoot(binding.root);
  requireThat(current.root === binding.root && current.device === binding.device && current.inode === binding.inode, "PROJECT_DIRECTORY_CHANGED");
  return binding;
}
