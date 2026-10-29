import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readlinkSync, readSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SkillCompatibility, SkillOrigin } from "../integration-contracts.ts";

/** Operator-owned local inputs. Never serialize these into a published inventory. */
export type SkillSource = SkillOrigin & { kind?: "skills" | "repository"; sourceRevision?: string };
export type SkillSelection = { id: string; contentHash: string; bundleHash?: string; originId?: string; path?: string };
export type InventoryLimits = {
  maxEntries: number; maxDepth: number; maxFilesPerBundle: number;
  maxFileBytes: number; maxTotalBytes: number; maxDiagnostics: number;
};
export const DEFAULT_LIMITS: Readonly<InventoryLimits> = Object.freeze({
  maxEntries: 100_000, maxDepth: 64, maxFilesPerBundle: 10_000,
  maxFileBytes: 8 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxDiagnostics: 1000,
});
export type Diagnostic = { originId: string; path: string; code: string };
export type Resource = {
  path: string; kind: "file" | "symlink" | "directory" | "other";
  status: "available" | "blocked" | "unavailable"; contentHash?: string; bytes?: number;
  linkHash?: string; reason?: string;
};
export type SkillLocation = {
  originId: string; path: string; bundlePath: string;
  link?: { linkHash: string; targetOriginId?: string; targetPath?: string; reason?: string };
};
export type SkillRecord = {
  id: string; name: string; kind: "skill" | "agent-instructions" | "unresolved-link";
  contentHash?: string; bundleHash: string; instructionBytes?: number;
  instructionPath: string; resources: Resource[]; origins: SkillLocation[];
  compatibility: SkillCompatibility; dependencyReasons: string[];
  loadable: boolean; complete: boolean;
  provenance: { declaredVersion: string | null; packageVersion: string | null; redistribution: "not-established"; licenseFileHashes: string[]; publicSourceLinks: string[] };
};
export type SkillsInventory = {
  schemaVersion: 1; hashAlgorithm: "sha256";
  coverageComplete: boolean; contentComplete: boolean;
  /** Backward-compatible alias for contentComplete; prefer the two explicit fields. */
  complete: boolean; truncated: boolean; diagnosticsDropped: number;
  limits: InventoryLimits; scannedEntries: number; hashedBytes: number;
  roots: { id: string; kind: "skills" | "repository"; status: "available" | "unavailable"; sourceRevision: string | null; metadata: Resource[]; exclusions: string[] }[];
  skills: SkillRecord[]; diagnostics: Diagnostic[];
  conflicts: { name: string; ids: string[]; reason: "different-instructions" | "different-bundles" }[];
  duplicateBodies: { contentHash: string; ids: string[]; origins: number }[];
  coverage: { origins: number; bundles: number; unavailable: number; bySource: Record<string, number>; byCompatibility: Record<SkillCompatibility, number> };
};

const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const posix = (path: string) => path.split(sep).join("/");
const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);
const hashPattern = /^[a-f0-9]{64}$/;
// These paths are never opened, even for hashing. Metadata records the omission.
const sensitive = /(?:^|\/)(?:\.env(?:\..*)?|\.ssh|auth\.json|credentials?(?:\..*)?|secrets?(?:\..*)?|config\.json|config\.properties|id_(?:rsa|ed25519))(?:\/|$)|\.(?:pem|key|p12)$/i;
const excludedNames = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", "__pycache__", ".venv", "venv"]);
const repositoryExclusions = [".tmp", ".lab", ".claude/worktrees", ".codex/worktrees", ".claude/sessions", ".codex/sessions"];

function safePath(path: string, dot = false): boolean {
  return typeof path === "string" && ((dot && path === ".") || (path.length > 0 && !isAbsolute(path) && !/[\\\x00-\x1f\x7f]/.test(path) && path.split("/").every(p => p !== ".." && p !== "." && p !== "")));
}
function validateSources(origins: SkillSource[]): void {
  if (!Array.isArray(origins) || origins.length === 0 || origins.length > 64) throw new Error("INVALID_SKILL_ORIGINS");
  const ids = new Set<string>();
  for (const origin of origins) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(origin.id) || ids.has(origin.id) || !isAbsolute(origin.root) || (origin.kind !== undefined && origin.kind !== "skills" && origin.kind !== "repository") || (origin.sourceRevision !== undefined && !/^[a-f0-9]{7,64}$/.test(origin.sourceRevision))) throw new Error("INVALID_SKILL_ORIGIN");
    ids.add(origin.id);
  }
}
function readBytes(path: string, boundary: string, maxBytes: number): Buffer {
  const sourceBefore = lstatSync(path);
  const actual = realpathSync(path);
  if (!inside(boundary, actual)) throw new Error("SYMLINK_OUTSIDE_BUNDLE");
  if (sensitive.test(posix(relative(boundary, actual)))) throw new Error("SENSITIVE_PATH_NOT_READ");
  const pathBefore = lstatSync(actual);
  const fd = openSync(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || !pathBefore.isFile()) throw new Error("NOT_REGULAR_FILE");
    if (before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) throw new Error("CHANGED_DURING_READ");
    if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > maxBytes) throw new Error("FILE_BYTE_LIMIT");
    // Never read to an unbounded EOF: a growing source cannot grow this allocation.
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const bytesRead = readSync(fd, buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const after = fstatSync(fd);
    const sourceAfter = lstatSync(path), pathAfter = lstatSync(actual);
    if (length !== before.size || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || realpathSync(path) !== actual || !pathAfter.isFile() || pathAfter.dev !== after.dev || pathAfter.ino !== after.ino || pathAfter.size !== after.size || pathAfter.mtimeMs !== after.mtimeMs || pathAfter.ctimeMs !== after.ctimeMs || sourceBefore.dev !== sourceAfter.dev || sourceBefore.ino !== sourceAfter.ino || sourceBefore.mode !== sourceAfter.mode || sourceBefore.size !== sourceAfter.size || sourceBefore.mtimeMs !== sourceAfter.mtimeMs || sourceBefore.ctimeMs !== sourceAfter.ctimeMs) throw new Error("CHANGED_DURING_READ");
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}
function code(error: unknown): string {
  const msg = error instanceof Error ? error.message : "UNREADABLE";
  return ["SYMLINK_OUTSIDE_BUNDLE", "SENSITIVE_PATH_NOT_READ", "NOT_REGULAR_FILE", "FILE_BYTE_LIMIT", "CHANGED_DURING_READ", "TOTAL_BYTE_LIMIT"].includes(msg) ? msg : "UNREADABLE";
}
function declared(text: string, key: string): string | null {
  const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const value = header?.match(new RegExp(`^${key}:\\s*["']?([a-zA-Z0-9_.+-]{1,80})["']?\\s*$`, "m"))?.[1];
  return value ?? null;
}
/** Static hints only: no tool availability, permission, or offline qualification is inferred. */
function classify(text: string, resources: Resource[], unavailable: boolean): { compatibility: SkillCompatibility; dependencyReasons: string[] } {
  const reasons: string[] = [];
  const local = [
    [/\/Users\/|\/home\/|~\//, "host-path"], [/\b(?:vault|obsidian|dotfiles|tmux|launchctl|brew|osascript)\b/i, "host-environment"],
    [/\b(?:python3?|uv|pip|node|bun|npm|npx|pnpm|git|glab|gh|rg|jq|ffmpeg|libreoffice|pdftotext)\b/i, "external-tool-or-runtime"],
    [/\b(?:T3|Claude|Codex|ChatGPT)\b/i, "agent-host-adaptation"],
  ] as const;
  const service = [
    [/\b(?:mcp__|mcp:|MCP|connector|connectors|API key|API_KEY|OAuth|authenticated)\b/i, "connected-tool-or-credentials"],
    [/\b(?:ssh|scp|tailscale|tailnet|jumphost)\b/i, "network-or-tailnet"],
    [/\b(?:Elasticsearch|Kibana|Slack|PagerDuty|Jira|Google Workspace|Vercel|GitLab|OpenAI API|imagegen)\b/i, "connected-service"],
    [/\b(?:web_search|web search|web\.run|browser tool|deep research|search the web)\b/i, "online-retrieval"],
  ] as const;
  for (const [pattern, reason] of local) if (pattern.test(text)) reasons.push(reason);
  if (resources.some(r => /(?:^scripts\/|\.(?:py|sh|mjs|cjs|ts|js)$)/.test(r.path))) reasons.push("bundled-code-needs-runtime");
  let connected = false;
  for (const [pattern, reason] of service) if (pattern.test(text)) { reasons.push(reason); connected = true; }
  const proprietary = /\b(?:proprietary|all rights reserved|license[^\n]{0,60}(?:Claude|Anthropic)|only (?:available|works)[^\n]{0,40}(?:Claude|Anthropic)|requires[^\n]{0,40}Claude Desktop)\b/i.test(text);
  if (unavailable) reasons.push("unavailable-or-incomplete-local-bundle");
  if (proprietary) reasons.push("proprietary-host-or-license");
  return { compatibility: unavailable || proprietary ? "proprietary-unavailable" : connected ? "connected-service" : reasons.length ? "local-dependency" : "portable", dependencyReasons: reasons.sort() };
}
function publicLinks(text: string): string[] {
  // Only well-known public source hosts; never publish query strings, fragments, private hosts or credentials.
  const found = new Set<string>();
  for (const raw of text.match(/https:\/\/[^\s<>"'`\])]+/g) ?? []) {
    try {
      const url = new URL(raw);
      if (["github.com", "raw.githubusercontent.com", "agentskills.io", "platform.openai.com", "developers.openai.com", "www.elastic.co"].includes(url.hostname) && !url.username && !url.password && /^[a-zA-Z0-9_./-]*$/.test(url.pathname)) found.add(url.origin + url.pathname);
    } catch { /* Invalid URLs are inert text. */ }
  }
  return [...found].sort();
}

/** Read metadata and hash bundles; never return instruction bodies, run scripts, or modify sources. */
export function discoverSkills(origins: SkillSource[], options: Partial<InventoryLimits> = {}): SkillsInventory {
  validateSources(origins);
  const limits = { ...DEFAULT_LIMITS, ...options };
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error("INVALID_INVENTORY_LIMIT");
  const report: SkillsInventory = {
    schemaVersion: 1, hashAlgorithm: "sha256", coverageComplete: true, contentComplete: true, complete: true, truncated: false, diagnosticsDropped: 0, limits,
    scannedEntries: 0, hashedBytes: 0, roots: [], skills: [], diagnostics: [], conflicts: [], duplicateBodies: [],
    coverage: { origins: 0, bundles: 0, unavailable: 0, bySource: {}, byCompatibility: { portable: 0, "local-dependency": 0, "connected-service": 0, "proprietary-unavailable": 0 } },
  };
  const selectedRoots = origins.flatMap(source => {
    try { return [{ source, root: realpathSync(source.root) }]; } catch { return []; }
  });
  const selectedTarget = (target: string) => selectedRoots.find(selected => inside(selected.root, target));
  const bundles = new Map<string, SkillRecord>();
  const diagnose = (origin: SkillSource, path: string, reason: string, incomplete = true) => {
    if (incomplete) report.complete = false;
    if (/LIMIT|DEPTH/.test(reason)) report.truncated = true;
    if (report.diagnostics.length < limits.maxDiagnostics) report.diagnostics.push({ originId: origin.id, path, code: reason });
    else report.diagnosticsDropped++;
  };
  const count = (origin: SkillSource, path: string) => {
    if (++report.scannedEntries > limits.maxEntries) { report.coverageComplete = false; diagnose(origin, path, "ENTRY_LIMIT"); return false; }
    return true;
  };
  const read = (path: string, boundary: string): Buffer => {
    if (report.hashedBytes >= limits.maxTotalBytes) throw new Error("TOTAL_BYTE_LIMIT");
    const bytes = readBytes(path, boundary, Math.min(limits.maxFileBytes, limits.maxTotalBytes - report.hashedBytes));
    report.hashedBytes += bytes.length;
    return bytes;
  };
  const add = (entry: SkillRecord) => {
    // Full instruction AND bundle identity; same body with conflicting resources remains separate.
    const key = `${entry.kind}:${entry.bundleHash}`;
    const existing = bundles.get(key);
    if (existing) existing.origins.push(...entry.origins);
    else { bundles.set(key, entry); report.skills.push(entry); }
  };
  for (const origin of origins) {
    const rootMeta: SkillsInventory["roots"][number] = { id: origin.id, kind: origin.kind ?? "skills", status: "available", sourceRevision: origin.sourceRevision ?? null, metadata: [], exclusions: [] };
    report.roots.push(rootMeta);
    let root: string;
    try { root = realpathSync(origin.root); if (!lstatSync(root).isDirectory()) throw new Error(); }
    catch { rootMeta.status = "unavailable"; report.coverageComplete = false; diagnose(origin, ".", "ROOT_UNAVAILABLE"); continue; }
    const originPath = (path: string) => posix(relative(root, path)) || ".";
    const unresolved = (path: string, reason: string, linkHash?: string) => {
      const rel = originPath(path), hash = sha(JSON.stringify([origin.id, rel, reason, linkHash ?? null]));
      add({ id: `unavailable:${hash}`, name: basename(path), kind: "unresolved-link", instructionPath: "SKILL.md", bundleHash: hash,
        resources: [], origins: [{ originId: origin.id, path: rel, bundlePath: rel, ...(linkHash ? { link: { linkHash, reason } } : {}) }],
        compatibility: "proprietary-unavailable", dependencyReasons: [reason], loadable: false, complete: false,
        provenance: { declaredVersion: null, packageVersion: null, redistribution: "not-established", licenseFileHashes: [], publicSourceLinks: [] },
      });
      diagnose(origin, rel, reason);
    };
    const bundle = (directory: string, instruction: string, kind: SkillRecord["kind"], singleton = false, reference?: SkillLocation["link"]) => {
      const originalInstructionPath = originPath(instruction), originalBundlePath = originPath(directory);
      let originLink = reference;
      // Instruction links are origin references, not permission to follow arbitrary resource links.
      try {
        if (lstatSync(instruction).isSymbolicLink()) {
          const target = realpathSync(instruction), selected = selectedTarget(target);
          if (!inside(realpathSync(directory), target) && selected) {
            originLink = { linkHash: sha(readlinkSync(instruction)), targetOriginId: selected.source.id, targetPath: posix(relative(selected.root, target)) };
            directory = dirname(target); instruction = target;
          }
        }
        if (reference?.targetOriginId && reference.targetPath) {
          const selected = selectedRoots.find(s => s.source.id === reference.targetOriginId)!;
          instruction = resolve(selected.root, reference.targetPath); directory = dirname(instruction);
        }
      } catch { /* Normal resource diagnostics retain broken or disallowed instruction links. */ }
      const scopedPath = (path: string) => posix(join(originalBundlePath, relative(directory, path)));
      const resources: Resource[] = []; let instructionText: string | undefined, instructionBytes: Buffer | undefined, complete = true, textHints = "", packageVersion: string | null = null;
      const boundary = realpathSync(directory);
      const inspect = (path: string, depth: number): void => {
        const rel = posix(relative(directory, path));
        if (resources.length >= limits.maxFilesPerBundle) { complete = false; diagnose(origin, scopedPath(path), "BUNDLE_ENTRY_LIMIT"); return; }
        if (!count(origin, scopedPath(path))) { complete = false; return; }
        if (depth > limits.maxDepth) { complete = false; diagnose(origin, scopedPath(path), "DEPTH_LIMIT"); return; }
        if (!safePath(rel)) { complete = false; diagnose(origin, ".", "UNSAFE_PATH"); return; }
        let resource: Resource = { path: rel, kind: "file", status: "available" };
        try {
          const stat = lstatSync(path);
          if (stat.isDirectory()) {
            resource.kind = "directory"; resources.push(resource);
            for (const name of readdirSync(path).sort()) {
              if (excludedNames.has(name)) {
                resources.push({ path: `${rel}/${name}`, kind: "directory", status: "blocked", reason: "EXCLUDED_BUNDLE_SUBTREE" });
                complete = false; diagnose(origin, scopedPath(join(path, name)), "EXCLUDED_BUNDLE_SUBTREE");
              } else inspect(join(path, name), depth + 1);
              if (resources.length >= limits.maxFilesPerBundle || report.scannedEntries > limits.maxEntries) break;
            }
            return;
          }
          if (stat.isSymbolicLink()) {
            resource.kind = "symlink"; resource.linkHash = sha(readlinkSync(path));
            const target = realpathSync(path);
            if (!inside(boundary, target)) {
              if (path === instruction) resource.reason = "INSTRUCTION_SYMLINK_OUTSIDE_SELECTED_ROOTS";
              throw new Error("SYMLINK_OUTSIDE_BUNDLE");
            }
            if (lstatSync(target).isDirectory()) { resource.reason = "DIRECTORY_SYMLINK_NOT_FOLLOWED"; throw new Error(); }
          } else if (!stat.isFile()) { resource.kind = "other"; resource.reason = "NOT_REGULAR_FILE"; throw new Error(); }
          if (sensitive.test(rel)) { resource.reason = "SENSITIVE_PATH_NOT_READ"; throw new Error(); }
          const bytes = read(path, boundary);
          resource.contentHash = sha(bytes); resource.bytes = bytes.length;
          if (rel === "package.json") {
            try { const value = JSON.parse(bytes.toString("utf8")).version; if (typeof value === "string" && /^[a-zA-Z0-9_.+-]{1,80}$/.test(value)) packageVersion = value; } catch { /* Resource identity remains recorded even if not valid JSON. */ }
          }
          if (path === instruction) {
            if (bytes.includes(0)) { resource.reason = "INVALID_INSTRUCTION_TEXT"; throw new Error(); }
            try { instructionText = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
            catch { resource.reason = "INVALID_INSTRUCTION_TEXT"; throw new Error(); }
            instructionBytes = bytes;
          }
          // Bounded dependency hints, never serialized. Binary data is only hashed.
          if (/\.(?:md|txt|json|yaml|yml|py|sh|js|ts|mjs|cjs)$/.test(rel) && !bytes.includes(0) && textHints.length < limits.maxFileBytes) textHints += "\n" + bytes.toString("utf8").slice(0, limits.maxFileBytes - textHints.length);
        } catch (error) {
          complete = false; resource.status = "blocked"; resource.reason ??= code(error);
          diagnose(origin, scopedPath(path), resource.reason);
        }
        resources.push(resource);
      };
      if (singleton) inspect(instruction, 0);
      else for (const name of readdirSync(directory).sort()) {
        if (excludedNames.has(name)) { resources.push({ path: name, kind: "directory", status: "blocked", reason: "EXCLUDED_BUNDLE_SUBTREE" }); complete = false; diagnose(origin, scopedPath(join(directory, name)), "EXCLUDED_BUNDLE_SUBTREE"); }
        else inspect(join(directory, name), 0);
        if (resources.length >= limits.maxFilesPerBundle || report.scannedEntries > limits.maxEntries) { complete = false; diagnose(origin, originalBundlePath, "BUNDLE_ENTRY_LIMIT"); break; }
      }
      resources.sort((a, b) => a.path.localeCompare(b.path, "en"));
      const bundleHash = sha(JSON.stringify(resources)), contentHash = instructionBytes ? sha(instructionBytes) : undefined;
      const classification = classify((instructionText ?? "") + "\n" + textHints, resources, !complete || !instructionBytes);
      const instructionResource = resources.find(r => r.path === posix(relative(directory, instruction)));
      add({ id: `skill:${bundleHash}`, name: declared(instructionText ?? "", "name") ?? (singleton ? originPath(instruction) : basename(directory)), kind,
        ...(contentHash ? { contentHash, instructionBytes: instructionBytes!.length } : {}), bundleHash, instructionPath: posix(relative(directory, instruction)), resources,
        origins: [{ originId: origin.id, path: originalInstructionPath, bundlePath: originalBundlePath, ...(originLink ? { link: originLink } : instructionResource?.linkHash ? { link: { linkHash: instructionResource.linkHash, reason: instructionResource.reason } } : {}) }],
        ...classification, complete, loadable: complete && instructionBytes !== undefined,
        provenance: { declaredVersion: declared(instructionText ?? "", "version"), packageVersion, redistribution: "not-established", licenseFileHashes: resources.filter(r => /(?:^|\/)licen[sc]e[^/]*$/i.test(r.path) && r.contentHash).map(r => r.contentHash!), publicSourceLinks: publicLinks(instructionText ?? "") },
      });
    };
    const walk = (directory: string, depth: number) => {
      if (depth > limits.maxDepth) { report.coverageComplete = false; diagnose(origin, originPath(directory), "DEPTH_LIMIT"); return; }
      let names: string[];
      try { names = readdirSync(directory).sort(); }
      catch { report.coverageComplete = false; unresolved(directory, "DIRECTORY_UNREADABLE"); return; }
      if (names.includes("SKILL.md")) { bundle(directory, join(directory, "SKILL.md"), "skill"); return; }
      for (const name of names) {
        const path = join(directory, name), rel = originPath(path);
        if (!count(origin, rel)) break;
        if (!safePath(rel)) { report.coverageComplete = false; diagnose(origin, ".", "UNSAFE_PATH"); continue; }
        if (excludedNames.has(name) || (origin.kind === "repository" && repositoryExclusions.includes(rel))) { rootMeta.exclusions.push(rel); continue; }
        try {
          const stat = lstatSync(path);
          if (stat.isSymbolicLink()) {
            // A skill-level link is an origin, even if its target is not approved.
            const linkHash = sha(readlinkSync(path));
            let target: string;
            try { target = realpathSync(path); }
            catch { unresolved(path, "BROKEN_ORIGIN_SYMLINK", linkHash); continue; }
            const selected = selectedTarget(target);
            if (lstatSync(target).isDirectory() && selected) {
              try {
                if (lstatSync(join(target, "SKILL.md")).isFile()) {
                  bundle(path, join(path, "SKILL.md"), "skill", false, { linkHash, targetOriginId: selected.source.id, targetPath: posix(relative(selected.root, join(target, "SKILL.md"))) });
                  continue;
                }
              } catch { /* Retain an unresolved origin when a linked directory is not a skill bundle. */ }
            }
            if (!selected) { unresolved(path, "ORIGIN_SYMLINK_OUTSIDE_SELECTED_ROOTS", linkHash); continue; }
            if (lstatSync(target).isDirectory()) { report.coverageComplete = false; unresolved(path, "ORIGIN_DIRECTORY_SYMLINK_NOT_FOLLOWED", linkHash); continue; }
            unresolved(path, "LOOSE_SYMLINK_NOT_FOLLOWED", linkHash);
          } else if (stat.isDirectory()) walk(path, depth + 1);
          else if (origin.kind === "repository" && (/^(?:AGENTS|CLAUDE)\.md$/.test(name) || (/(?:^|\/)(?:agents|\.github\/agents)\//.test(rel) && /\.md$/.test(name) && !rel.includes("/skills/")))) bundle(directory, path, "agent-instructions", true);
          else if ((directory === root && ["manifest.json", "package.json"].includes(name)) || (origin.kind !== "repository" && ((name === ".codex-system-skills.marker" && rel === ".system/.codex-system-skills.marker") || (name === "manifest.json" && /^synced\/[^/]+\/manifest\.json$/.test(rel))))) {
            try { const bytes = read(path, root); rootMeta.metadata.push({ path: rel, kind: "file", status: "available", contentHash: sha(bytes), bytes: bytes.length }); }
            catch (error) { rootMeta.metadata.push({ path: rel, kind: "file", status: "unavailable", reason: code(error) }); diagnose(origin, rel, code(error)); }
          }
        } catch { unresolved(path, "ENTRY_UNAVAILABLE"); }
      }
    };
    walk(root, 0);
    rootMeta.exclusions.sort();
  }
  report.skills.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const names = new Map<string, SkillRecord[]>(), bodies = new Map<string, SkillRecord[]>();
  for (const skill of report.skills) {
    skill.origins.sort((a, b) => `${a.originId}/${a.path}`.localeCompare(`${b.originId}/${b.path}`, "en"));
    names.set(skill.name, [...(names.get(skill.name) ?? []), skill]);
    if (skill.contentHash) bodies.set(skill.contentHash, [...(bodies.get(skill.contentHash) ?? []), skill]);
    report.coverage.bundles++; report.coverage.origins += skill.origins.length;
    if (!skill.loadable) report.coverage.unavailable += skill.origins.length;
    report.coverage.byCompatibility[skill.compatibility] += skill.origins.length;
    for (const location of skill.origins) report.coverage.bySource[location.originId] = (report.coverage.bySource[location.originId] ?? 0) + 1;
  }
  for (const [name, records] of names) if (records.length > 1) report.conflicts.push({ name, ids: records.map(s => s.id), reason: new Set(records.map(s => s.contentHash)).size > 1 ? "different-instructions" : "different-bundles" });
  for (const [contentHash, records] of bodies) {
    const count = records.reduce((n, s) => n + s.origins.length, 0);
    if (count > 1) report.duplicateBodies.push({ contentHash, ids: records.map(s => s.id), origins: count });
  }
  report.contentComplete = report.complete;
  return report;
}

export function selectSkill(skill: SkillRecord, location: SkillLocation = skill.origins[0]!): Required<SkillSelection> {
  if (!skill.loadable || !skill.contentHash || !skill.origins.some(o => o.originId === location.originId && o.path === location.path)) throw new Error("SKILL_UNAVAILABLE");
  return { id: skill.id, contentHash: skill.contentHash, bundleHash: skill.bundleHash, originId: location.originId, path: location.path };
}
function resolveSelection(selection: SkillSelection, origins: SkillSource[], inventory?: SkillsInventory): { record: SkillRecord; location: SkillLocation } {
  if (!selection || typeof selection.id !== "string" || !hashPattern.test(selection.contentHash) || (selection.bundleHash !== undefined && !hashPattern.test(selection.bundleHash)) || (selection.path !== undefined && !safePath(selection.path)) || (selection.originId !== undefined && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(selection.originId))) throw new Error("INVALID_SKILL_SELECTION");
  if (!inventory && (!selection.bundleHash || !selection.originId || !selection.path)) throw new Error("UNSEALED_SKILL_SELECTION");
  const baseline = inventory ?? discoverSkills(origins);
  const record = baseline.skills.find(s => s.id === selection.id && s.contentHash === selection.contentHash && (selection.bundleHash === undefined || s.bundleHash === selection.bundleHash));
  if (!record?.loadable) throw new Error("STALE_OR_UNAVAILABLE_SKILL");
  const locations = record.origins.filter(o => (selection.originId === undefined || o.originId === selection.originId) && (selection.path === undefined || o.path === selection.path));
  if (locations.length !== 1) throw new Error("AMBIGUOUS_SKILL_ORIGIN");
  const location = locations[0]!;
  // Exact origin is revalidated: never switch to an unchanged duplicate as a fallback.
  const fresh = discoverSkills(origins).skills.find(s => s.origins.some(o => o.originId === location.originId && o.path === location.path));
  if (!fresh?.loadable || fresh.contentHash !== record.contentHash || fresh.bundleHash !== record.bundleHash) throw new Error("STALE_SKILL_BUNDLE");
  return { record: fresh, location: fresh.origins.find(o => o.originId === location.originId && o.path === location.path)! };
}

/** Context verifier: false for missing/changed instructions OR resources, without exposing text. */
export function verifySkill(selection: SkillSelection, origins: SkillSource[], inventory?: SkillsInventory): boolean {
  try { resolveSelection(selection, origins, inventory); return true; } catch { return false; }
}

/** Explicit local import. Returns text only to this caller; no copy, execution, or logging. */
export function loadSkill(selection: SkillSelection, origins: SkillSource[], inventory?: SkillsInventory): { selection: Required<SkillSelection>; text: string; skill: SkillRecord } {
  const { record, location } = resolveSelection(selection, origins, inventory);
  const source = origins.find(o => o.id === location.originId);
  if (!source || !safePath(location.bundlePath, true) || !safePath(record.instructionPath)) throw new Error("INVALID_SKILL_ORIGIN");
  const root = realpathSync(source.root), actualInstruction = realpathSync(resolve(root, location.path));
  let boundary = realpathSync(resolve(root, location.bundlePath));
  if (location.link?.targetOriginId && location.link.targetPath) {
    const targetSource = origins.find(o => o.id === location.link!.targetOriginId);
    if (!targetSource || !safePath(location.link.targetPath)) throw new Error("SKILL_ORIGIN_ESCAPE");
    const targetRoot = realpathSync(targetSource.root), target = realpathSync(resolve(targetRoot, location.link.targetPath));
    if (!inside(targetRoot, target) || target !== actualInstruction) throw new Error("SKILL_ORIGIN_ESCAPE");
    boundary = dirname(target);
  } else if (!inside(root, boundary)) throw new Error("SKILL_ORIGIN_ESCAPE");
  const bytes = readBytes(actualInstruction, boundary, DEFAULT_LIMITS.maxFileBytes);
  if (sha(bytes) !== record.contentHash) throw new Error("STALE_SKILL_INSTRUCTIONS");
  // Verify again after reading, so a resource changed during the load cannot silently pass.
  if (!verifySkill(selectSkill(record, location), origins, inventory)) throw new Error("STALE_SKILL_BUNDLE");
  return { selection: selectSkill(record, location), text: bytes.toString("utf8"), skill: record };
}
