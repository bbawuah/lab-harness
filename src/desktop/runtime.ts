/** Pinned agent-desktop identity. Verification only; nothing here downloads or spawns. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import source from "../../contracts/agent-desktop-source.json";

export const desktopInstallRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const desktopDirectory = join(desktopInstallRoot, ".tmp/desktop");
export const desktopBinary = join(desktopDirectory, "agent-desktop");
export const desktopHelper = join(desktopDirectory, "agent-desktop-macos-helper");
export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export type DesktopArtifact = (typeof source.artifacts)[number];

/** macOS 13 is Darwin 22. Windows, Linux and WSL are out of scope (see docs/desktop-workspace-contract.md). */
export function desktopArtifact(platform = process.platform, arch = process.arch, kernel = release()): DesktopArtifact {
  if (platform !== "darwin") throw new Error("LAB_DESKTOP_UNSUPPORTED: desktop control is macOS-only in this release; Windows, Linux and WSL are not supported.");
  if (Number(kernel.split(".")[0]) < 22) throw new Error("LAB_DESKTOP_UNSUPPORTED: desktop control needs macOS 13 or later.");
  const artifact = source.artifacts.find(a => a.platform === platform && a.arch === arch);
  if (!artifact) throw new Error("LAB_DESKTOP_UNSUPPORTED: no pinned agent-desktop build for this Mac.");
  return artifact;
}

/** Both pinned executables must be private regular single-link files with the exact size and SHA-256. */
export function verifyDesktopRuntime(directory = desktopDirectory): { binary: string; helper: string } {
  const artifact = desktopArtifact();
  for (const member of artifact.members) {
    const path = join(directory, member.name);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0 || stat.size !== member.bytes || digest(readFileSync(path)) !== member.sha256)
      throw new Error("LAB_DESKTOP_MISSING: run lab --setup-desktop (or --setup-desktop --offline with a verified cache).");
  }
  return { binary: join(directory, "agent-desktop"), helper: join(directory, "agent-desktop-macos-helper") };
}
export const desktopVersion = source.version;
