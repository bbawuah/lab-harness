import { lstatSync, opendirSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ownedState } from "./ledger.ts";
import { LabError, requireThat, textHash } from "./util.ts";

const forbidden = (name: string) => name === "config.properties" || name === "config.json" || name.startsWith(".env") || [".git", "node_modules", ".lab", ".tmp"].includes(name);
export type Hit = { path: string; line: number; text: string; contentHash: string };
export type Operation = { kind: "write-document"; path: string; body: string } | { kind: "search"; query: string };
export type SearchReport = { hits: Hit[]; visitedEntries: number; truncated: boolean; omissions: { path: string; reason: string }[] };
/** Narrow concept helper, not an OS sandbox or replacement for the current host guard. */
export class Workspace {
  readonly root: string;
  constructor(root: string) { this.root = realpathSync(ownedState(root)); }
  private path(relativePath: string): string {
    requireThat(!isAbsolute(relativePath) && !relativePath.includes("\0"), "OUTSIDE_WORKSPACE");
    const parts = relativePath.split(/[\\/]/); requireThat(parts.length > 0 && parts.every(p => p && p !== ".." && p !== "." && !forbidden(p)), "EXCLUDED_PATH");
    const full = resolve(this.root, ...parts); requireThat(full.startsWith(this.root + "/"), "OUTSIDE_WORKSPACE");
    let cursor = full;
    while (cursor !== this.root) {
      const s = lstatSync(cursor, { throwIfNoEntry: false });
      if (s) requireThat(!s.isSymbolicLink() && (s.isDirectory() || s.isFile() && s.nlink === 1), "UNSAFE_WORKSPACE_PATH");
      cursor = dirname(cursor);
    }
    return full;
  }
  read(path: string): { text: string; contentHash: string } {
    const full = this.path(path), stat = lstatSync(full); requireThat(stat.isFile() && stat.size <= 1024 * 1024, "UNSUPPORTED_FILE");
    const bytes = readFileSync(full); requireThat(!bytes.includes(0), "BINARY_FILE"); let text: string;
    // ignoreBOM=true preserves U+FEFF instead of stripping its original UTF8 bytes.
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new LabError("INVALID_UTF8"); }
    return { text, contentHash: textHash(text) };
  }
  search(query: string, limit = 5): Hit[] {
    return this.searchDetailed(query, limit).hits;
  }
  searchDetailed(query: string, limit = 5): SearchReport {
    requireThat(query.length > 0 && query.length <= 512 && Number.isSafeInteger(limit) && limit > 0 && limit <= 20, "INVALID_SEARCH");
    const report: SearchReport = { hits: [], visitedEntries: 0, truncated: false, omissions: [] };
    const omit = (path: string, reason: string): void => { if (report.omissions.length < 20) report.omissions.push({ path, reason }); };
    const walk = (directory: string, depth: number): void => {
      if (depth > 20) { report.truncated = true; omit(relative(this.root, directory), "depth-limit"); return; }
      const dir = opendirSync(directory);
      try { for (;;) {
        if (report.hits.length >= limit || report.visitedEntries >= 1000) { report.truncated = true; return; }
        const entry = dir.readSync(); if (!entry) return; report.visitedEntries++;
        if (forbidden(entry.name) || entry.isSymbolicLink()) continue;
        const full = join(directory, entry.name), path = relative(this.root, full);
        if (entry.isDirectory()) { walk(full, depth + 1); continue; }
        if (!entry.isFile() || lstatSync(full).size > 1024 * 1024) { omit(path, "unsupported-file"); continue; }
        let data: { text: string; contentHash: string };
        try { data = this.read(path); }
        catch (error) { if (error instanceof LabError && ["BINARY_FILE", "INVALID_UTF8", "UNSUPPORTED_FILE"].includes(error.code)) { omit(path, error.code); continue; } throw error; }
        for (const [index, line] of data.text.split("\n").entries()) if (line.includes(query) && report.hits.length < limit) report.hits.push({ path, line: index + 1, text: line.slice(0, 400), contentHash: data.contentHash });
      } } finally { dir.closeSync(); }
    };
    walk(this.root, 0); return report;
  }
  applyOperation(operation: Operation): unknown {
    // Classify the structured operation only. Document text is inert payload.
    if (operation.kind === "search") return this.search(operation.query);
    requireThat(operation.kind === "write-document" && typeof operation.body === "string" && Buffer.byteLength(operation.body) <= 64000, "UNSUPPORTED_OPERATION");
    const full = this.path(operation.path); mkdirSync(dirname(full), { recursive: true, mode: 0o700 }); writeFileSync(full, operation.body, { mode: 0o600 }); return { written: operation.path, contentHash: textHash(operation.body) };
  }
  skill(path: string): { path: string; id: string; description: string; contentHash: string; resourcesQualified: false } {
    requireThat(path.endsWith("/SKILL.md"), "INVALID_SKILL_PATH"); const data = this.read(path);
    const id = /^name:\s*(.+)$/m.exec(data.text)?.[1]?.trim(), description = /^description:\s*(.+)$/m.exec(data.text)?.[1]?.trim();
    requireThat(id && description, "INVALID_SKILL_METADATA"); return { path, id, description, contentHash: data.contentHash, resourcesQualified: false };
  }
}
