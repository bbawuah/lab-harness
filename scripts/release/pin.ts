import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { command, digest } from "../bundle/common.ts";

export function bootstrapPin(source: string): { commit: string; sha256: string } {
  const commit = source.match(/^  bootstrap_commit=([a-f0-9]{40})$/m)?.[1];
  const sha256 = source.match(/^  bootstrap_sha256=([a-f0-9]{64})$/m)?.[1];
  if (!commit || !sha256) throw new Error("Missing immutable bootstrap pin");
  return { commit, sha256 };
}
export function assertNotOlder(repo: string, latest: string, pin: string): void {
  command("git", ["merge-base", "--is-ancestor", latest, pin], repo);
}
if (import.meta.main) {
  const root = resolve(import.meta.dir, "../.."), [mode, ref] = process.argv.slice(2);
  if (mode === "prepare" && ref && process.argv.length === 5) {
    const commit = command("git", ["rev-parse", "--verify", `${ref}^{commit}`], root).toString().trim();
    const response = await fetch(`https://codeload.github.com/bbawuah/lab-harness/tar.gz/${commit}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Published source commit is unavailable: HTTP ${response.status}`);
    const archive = new Uint8Array(await response.arrayBuffer());
    if (archive.byteLength > 16777216) throw new Error("Source archive exceeds bootstrap limit");
    const path = resolve(root, "bootstrap.sh"), source = readFileSync(path, "utf8"); bootstrapPin(source);
    writeFileSync(path, source.replace(/^  bootstrap_commit=.*$/m, `  bootstrap_commit=${commit}`).replace(/^  bootstrap_sha256=.*$/m, `  bootstrap_sha256=${digest(archive)}`));
    console.log(`Prepared bootstrap pin ${commit}; refresh publication, review and commit before tagging.`);
  } else if (mode === "check" && !ref) {
    const pin = bootstrapPin(readFileSync(resolve(root, "bootstrap.sh"), "utf8"));
    const latest = spawnSync("gh", ["api", "repos/bbawuah/lab-harness/releases/latest"], { encoding: "utf8" });
    if (latest.status !== 0 && !latest.stderr.includes("HTTP 404")) throw new Error(`Cannot inspect latest release: ${latest.stderr}`);
    const release = latest.status === 0 ? JSON.parse(latest.stdout) as { tag_name: string } : undefined;
    if (release) {
      const commit = command("git", ["rev-parse", "--verify", `${release.tag_name}^{commit}`], root).toString().trim();
      assertNotOlder(root, commit, pin.commit);
      console.log(`Bootstrap pin ${pin.commit} includes latest stable release ${release.tag_name} (${commit}).`);
    } else console.log("No stable GitHub Release exists yet; bootstrap has a valid immutable pin.");
  } else if (mode === "tag" && ref && process.argv.length === 5) {
    const commit = command("git", ["rev-parse", "--verify", `${ref}^{commit}`], root).toString().trim();
    const version = JSON.parse(command("git", ["show", `${commit}:package.json`], root).toString()).version;
    if (ref !== `v${version}`) throw new Error("Tag must match package.json version");
    command("git", ["merge-base", "--is-ancestor", commit, "origin/main"], root);
    const pin = bootstrapPin(command("git", ["show", "origin/main:bootstrap.sh"], root).toString());
    if (pin.commit !== commit) throw new Error("Before publishing, main bootstrap must pin the exact release source commit. Run pin.ts prepare, refresh publication and merge that pin update first.");
    const response = await fetch(`https://codeload.github.com/bbawuah/lab-harness/tar.gz/${commit}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok || digest(new Uint8Array(await response.arrayBuffer())) !== pin.sha256) throw new Error("Main bootstrap source checksum does not match release");
    console.log(`Release tag ${ref} is committed on main and its exact archive is pinned by main bootstrap.`);
  } else throw new Error("Usage: pin.ts prepare COMMIT | check | tag vVERSION");
}
