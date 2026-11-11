import { lstatSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { digest, type Manifest } from "./common.ts";

const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
function safeAncestors(path: string) {
  for (let p = dirname(path);; p = dirname(p)) {
    const stat = lstatSync(p, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Unsafe uninstall ancestor: ${p}`);
    if (p === dirname(p)) break;
  }
}
export function uninstall(release: string, home: string, data: string, apply = false): string[] {
  release = resolve(release);
  const root = join(data, "lab-harness"), receipt = join(release, ".tmp/bundle-receipt.json");
  safeAncestors(receipt);
  const receiptStat = lstatSync(receipt);
  if (!receiptStat.isFile() || receiptStat.isSymbolicLink() || receiptStat.nlink !== 1) throw new Error("Unsafe uninstall receipt");
  const manifest = JSON.parse(readFileSync(receipt, "utf8")) as Manifest;
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.commit) || release !== join(root, "releases", manifest.commit)) throw new Error("Uninstall requires an owned bundle release and its matching HOME/XDG_DATA_HOME");
  const known = new Map<string, string>();
  for (const [path, item] of Object.entries(manifest.files)) {
    if (path.startsWith("/") || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Unsafe uninstall receipt path");
    if (path.startsWith("harness/")) known.set(join(release, path.slice(8)), item.sha256);
    if (path.startsWith("LICENSES/")) known.set(join(release, ".tmp/bundle-licenses", path.slice(9)), item.sha256);
  }
  const launcher = join(root, "lab"), shim = join(home, ".local/bin/lab");
  const expectedLauncher = `#!/bin/sh\n# LAB-HARNESS owned launcher\nexport LAB_WORKSPACE_STATE_ROOT=${quote(join(home, ".local/share/lab-harness/workspace"))}\nexec ${quote(join(release, "lab"))} "$@"\n`;
  const matches = (path: string, sha256: string) => {
    safeAncestors(path);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    return Boolean(stat?.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && digest(readFileSync(path)) === sha256);
  };
  if (matches(launcher, digest(expectedLauncher))) {
    known.set(launcher, digest(expectedLauncher));
    known.set(shim, digest(`#!/bin/sh\n# LAB-HARNESS owned command shim\nexec ${quote(launcher)} "$@"\n`));
  }
  const selected = [...known].filter(([path, sha256]) => matches(path, sha256)).map(([path]) => path);
  // Keep the receipt for changed or unknown files so a later inspection has provenance.
  const unknown: string[] = [];
  function inspect(path: string) {
    for (const name of readdirSync(path)) {
      const child = join(path, name), stat = lstatSync(child);
      if (stat.isDirectory() && !stat.isSymbolicLink()) inspect(child);
      else if (child !== receipt && !selected.includes(child)) unknown.push(child);
    }
  }
  inspect(release);
  if (!unknown.length) selected.push(receipt);
  if (apply) {
    // All paths and identities were checked before the first mutation.
    for (const path of selected) {
      const expected = path === receipt ? digest(readFileSync(receipt)) : known.get(path)!;
      if (!matches(path, expected)) throw new Error(`Uninstall path changed: ${path}`);
      unlinkSync(path);
    }
    const parents = new Set<string>();
    for (const path of selected) {
      for (let parent = dirname(path); parent === release || parent.startsWith(release + "/"); parent = dirname(parent)) parents.add(parent);
    }
    for (const path of [...parents].sort((a, b) => b.length - a.length)) {
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat?.isDirectory() && !stat.isSymbolicLink() && readdirSync(path).length === 0) rmdirSync(path);
    }
  }
  return selected;
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== "--apply") || args.length > 1) throw new Error("Usage: uninstall.sh [--apply]");
  const home = process.env.HOME;
  if (!home || !home.startsWith("/")) throw new Error("An absolute HOME is required");
  const data = process.env.XDG_DATA_HOME ?? join(home, ".local/share");
  if (!data.startsWith("/")) throw new Error("An absolute XDG_DATA_HOME is required");
  const selected = uninstall(resolve(import.meta.dir, "../.."), home, data, args.includes("--apply"));
  const summary = `${args.includes("--apply") ? "Removed" : "Would remove"} ${selected.length} unchanged LAB-owned files. Changed/unknown files and private workspace state are retained.\n`;
  await Bun.write(Bun.stdout, summary + (args.includes("--apply") ? "" : selected.join("\n") + "\nRun with --apply to remove these files.\n"));
}
