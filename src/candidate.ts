import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONCEPT_ROOT } from "./ledger.ts";
import { hash, requireThat } from "./util.ts";
import type { Candidate } from "./protocol.ts";

/** Exact working bytes of the declared publishable source closure, including its manifest. */
export function captureCandidate(): Candidate {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: CONCEPT_ROOT, encoding: "utf8", timeout: 1000, maxBuffer: 1024, shell: false });
  requireThat(git.status === 0 && /^[a-f0-9]{40}\n?$/.test(git.stdout), "CANDIDATE_HEAD_UNAVAILABLE");
  const manifest = JSON.parse(readFileSync(join(CONCEPT_ROOT, "docs/source-manifest.json"), "utf8")) as { publicationFileAllowlist: string[] };
  requireThat(Array.isArray(manifest.publicationFileAllowlist) && manifest.publicationFileAllowlist.length < 10000, "INVALID_CANDIDATE_MANIFEST");
  const files = [...manifest.publicationFileAllowlist].sort().map(path => {
    requireThat(typeof path === "string" && path.split("/").every(part => part && part !== "." && part !== ".." && !part.includes("\\")) && !path.includes("\0"), "INVALID_CANDIDATE_PATH");
    return { path, sha256: createHash("sha256").update(readFileSync(join(CONCEPT_ROOT, path))).digest("hex") };
  });
  return { candidateSHA: git.stdout.trim(), dirtyHash: hash({ scope: "publication-allowlist-working-bytes-v1", files }) };
}
