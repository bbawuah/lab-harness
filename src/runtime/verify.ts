import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import herdr from "../../contracts/herdr-source.json";
import rg from "../../contracts/ripgrep-source.json";
import fd from "../../contracts/fd-source.json";
import { verifyPiRuntime } from "./pi.ts";

const root = resolve(import.meta.dir, "../..");
function binary(path: string, expected: string | undefined): void {
  const stat = lstatSync(path);
  if (!expected || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o111) === 0 || realpathSync(path) !== path ||
    createHash("sha256").update(readFileSync(path)).digest("hex") !== expected) throw new Error("Runtime cache is missing or unverified");
}
/** Healthy starts only read verified runtime bytes; acquisitions repair on failure. */
export function verifyInstalledRuntime(): void {
  const name = `herdr-${process.platform === "darwin" ? "macos" : process.platform}-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;
  binary(join(root, ".tmp/herdr/herdr"), herdr.runtime.artifacts.find(a => a.name === name)?.sha256);
  binary(join(root, ".tmp/rg/rg"), rg.artifacts.find(a => a.platform === process.platform && a.arch === process.arch)?.binarySHA256);
  binary(join(root, ".tmp/fd/fd"), fd.artifacts.find(a => a.platform === process.platform && a.arch === process.arch)?.binarySHA256);
  verifyPiRuntime();
}
