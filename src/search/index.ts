import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync, type Stats } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { SearchOptions as ContractOptions, SearchResult, SourceReference } from "../integration-contracts.ts";
import { CONCEPT_ROOT, ownedState } from "../ledger.ts";
import { LabError, requireThat } from "../util.ts";
import { verifyProjectBinding, type ProjectBinding } from "../project.ts";

export type { SearchResult, SourceReference } from "../integration-contracts.ts";
export type SearchOptions = ContractOptions & {
  /** Explicit read-only access to this harness checkout root in interactive mode. */
  allowRepositoryRoot?: boolean;
  /** Explicit interactive project; default callers retain owned-root rules. */
  projectBinding?: ProjectBinding;
  maxTotalBytes?: number;
  maxDepth?: number;
  maxSnippetBytes?: number;
};
type Bounds = Required<Omit<SearchOptions, "allowRepositoryRoot" | "projectBinding">>;
const defaults: Bounds = { engine: "auto", limit: 5, maxEntries: 10000, maxFileBytes: 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024, maxDepth: 20, maxSnippetBytes: 400 };
const caps = { limit: 1000, maxEntries: 100000, maxFileBytes: 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxDepth: 40, maxSnippetBytes: 4096 };
const forbidden = (name: string): boolean => name === "config.properties" || name === "config.json" || name.startsWith(".env") || [".git", ".lab", ".tmp", "node_modules"].includes(name);
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const same = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && b.nlink === 1;
const snippet = (line: string, bytes: number): string => {
  // Decode only complete UTF-8 characters; never return a replacement character.
  let result = "", used = 0;
  for (const char of line) { const n = Buffer.byteLength(char); if (used + n > bytes) break; result += char; used += n; }
  return result;
};
function bounds(options: SearchOptions): Bounds {
  const { allowRepositoryRoot, projectBinding, ...limits } = options;
  requireThat(allowRepositoryRoot === undefined || typeof allowRepositoryRoot === "boolean", "INVALID_SEARCH_OPTIONS");
  const value = { ...defaults, ...limits };
  requireThat(["auto", "fallback", "rg"].includes(value.engine), "INVALID_SEARCH_OPTIONS");
  for (const key of Object.keys(caps) as (keyof typeof caps)[]) requireThat(Number.isSafeInteger(value[key]) && value[key] > 0 && value[key] <= caps[key], "INVALID_SEARCH_OPTIONS");
  return value;
}

/** Offline working-byte search within an owned project subdirectory; not an OS sandbox. */
export class SearchService {
  readonly root: string;
  private readonly options: Bounds;
  private readonly identity: Stats;
  constructor(root: string, options: SearchOptions = {}) {
    this.options = bounds(options);
    const repositoryRoot = options.allowRepositoryRoot === true && root === CONCEPT_ROOT;
    const project = options.projectBinding && verifyProjectBinding(options.projectBinding);
    if (project) requireThat(root === project.root, "PROJECT_ROOT_BINDING_MISMATCH");
    this.root = realpathSync(project ? project.root : repositoryRoot ? CONCEPT_ROOT : ownedState(root));
    this.identity = lstatSync(this.root);
  }
  private assertRoot(): void {
    const stat = lstatSync(this.root);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === this.identity.dev && stat.ino === this.identity.ino && realpathSync(this.root) === this.root, "UNSAFE_SEARCH_ROOT");
  }
  private path(path: string): string {
    this.assertRoot();
    requireThat(typeof path === "string" && !isAbsolute(path) && !path.includes("\0"), "OUTSIDE_WORKSPACE");
    const parts = path.split("/");
    requireThat(parts.length > 0 && parts.every(p => p && p !== "." && p !== ".." && !p.includes("\\") && !forbidden(p)), "EXCLUDED_PATH");
    let cursor = this.root;
    for (const part of parts) {
      cursor = join(cursor, part);
      const stat = lstatSync(cursor);
      requireThat(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile() && stat.nlink === 1), "UNSAFE_WORKSPACE_PATH");
    }
    requireThat(realpathSync(cursor) === cursor, "UNSAFE_WORKSPACE_PATH");
    return cursor;
  }
  private read(path: string, maxBytes: number): { text: string; contentHash: string; bytes: Buffer } {
    const full = this.path(path), before = lstatSync(full);
    requireThat(before.isFile() && before.size <= maxBytes, "FILE_BYTE_LIMIT");
    const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      requireThat(opened.isFile() && same(before, opened), "SOURCE_CHANGED");
      this.path(path); // Recheck ancestors after opening, before reading any content.
      const bytes = Buffer.alloc(opened.size + 1);
      let count = 0;
      while (count < bytes.length) { const n = readSync(fd, bytes, count, bytes.length - count, null); if (!n) break; count += n; }
      requireThat(count === opened.size && same(opened, fstatSync(fd)) && same(opened, lstatSync(this.path(path))), "SOURCE_CHANGED");
      const source = bytes.subarray(0, count);
      requireThat(!source.includes(0), "BINARY_FILE");
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(source); } catch { throw new LabError("INVALID_UTF8"); }
      return { text, bytes: source, contentHash: createHash("sha256").update(source).digest("hex") };
    } finally { closeSync(fd); }
  }
  text(query: string, options: SearchOptions = {}): SearchResult { return this.search("text", query, options); }
  files(query: string, options: SearchOptions = {}): SearchResult { return this.search("files", query, options); }
  private search(kind: "text" | "files", query: string, options: SearchOptions): SearchResult {
    requireThat(typeof query === "string" && query.length > 0 && query.length <= 512 && !/[\0\r\n]/.test(query) && Buffer.from(query).toString("utf8") === query, "INVALID_SEARCH");
    const config = bounds({ ...this.options, ...options });
    this.assertRoot();
    const result: SearchResult = { hits: [], engine: "fallback", truncated: false, omissions: [] };
    let visited = 0, readBytes = 0, rgCalls = 0, stop = false, useRg = kind === "text" && config.engine === "rg";
    if (useRg) result.engine = "rg";
    const omit = (path: string, reason: string): void => { if (result.omissions.length < 100) result.omissions.push({ path, reason }); };
    const limited = (path: string, reason: string): void => { result.truncated = true; omit(path, reason); };
    const visit = (directory: string, depth: number): void => {
      if (stop) return;
      const path = relative(this.root, directory).split(sep).join("/");
      if (depth > config.maxDepth) { limited(path, "depth-limit"); return; }
      if (path) this.path(path); else this.assertRoot();
      const dir = opendirSync(directory), entries: string[] = [];
      try {
        for (;;) {
          const entry = dir.readSync(); if (!entry) break;
          if (visited >= config.maxEntries) { limited(path, "entry-limit"); stop = true; return; }
          visited++; entries.push(entry.name);
        }
      } finally { dir.closeSync(); }
      // A directory exceeding the remaining budget yields no arbitrary OS-order prefix.
      entries.sort(order);
      for (const name of entries) {
        if (stop) return;
        const child = path ? `${path}/${name}` : name;
        if (forbidden(name)) { omit(child, "excluded"); continue; }
        try {
          const full = this.path(child), stat = lstatSync(full);
          if (stat.isDirectory()) { visit(full, depth + 1); continue; }
          if (stat.size > config.maxFileBytes) { limited(child, "file-byte-limit"); continue; }
          if (kind === "files" && !name.includes(query)) continue;
          // Reserve the allocation before read; unsuccessful reads still consume budget.
          if (readBytes + stat.size + 1 > config.maxTotalBytes) { limited(child, "total-byte-limit"); stop = true; return; }
          readBytes += stat.size + 1;
          const data = this.read(child, Math.min(config.maxFileBytes, stat.size));
          if (useRg && rgCalls >= 128) { useRg = false; result.engine = "fallback"; }
          if (useRg) {
            rgCalls++;
            const candidate = spawnSync("rg", ["--no-config", "--encoding", "none", "--fixed-strings", "--text", "--quiet", "--", query], { input: data.bytes, shell: false, timeout: 1000, maxBuffer: 1024, stdio: ["pipe", "ignore", "ignore"] });
            if (candidate.error || (candidate.status !== 0 && candidate.status !== 1)) { useRg = false; result.engine = "fallback"; }
            else if (candidate.status === 1) continue;
          }
          // JS supplies canonical snippets/provenance for both engines.
          let start = 0, line = 1;
          for (;;) {
            const end = data.text.indexOf("\n", start), text = data.text.slice(start, end < 0 ? undefined : end);
            if (kind === "files" || text.includes(query)) {
              if (result.hits.length === config.limit) { limited(child, "result-limit"); stop = true; return; }
              result.hits.push({ path: child, contentHash: data.contentHash, lineStart: line, lineEnd: line, text: snippet(text, config.maxSnippetBytes) });
            }
            if (kind === "files" || end < 0) break;
            start = end + 1; line++;
          }
        } catch (error) {
          // Permission errors are surfaced, never treated as engine fallback.
          if (!(error instanceof LabError) && (error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") throw error;
          omit(child, error instanceof LabError ? error.code : "SOURCE_REMOVED");
        }
      }
    };
    visit(this.root, 0);
    return result;
  }
  /** A current byte check; validity is not a promise that a later read is unchanged. */
  verify(ref: SourceReference): boolean {
    try {
      if (!ref || !Number.isSafeInteger(ref.lineStart) || ref.lineStart < 1 || ref.lineStart !== ref.lineEnd || typeof ref.text !== "string" || Buffer.byteLength(ref.text) > caps.maxSnippetBytes || !/^[a-f0-9]{64}$/.test(ref.contentHash)) return false;
      const data = this.read(ref.path, this.options.maxFileBytes);
      if (data.contentHash !== ref.contentHash) return false;
      const line = data.text.split("\n")[ref.lineStart - 1];
      return line !== undefined && line.startsWith(ref.text);
    } catch { return false; }
  }
}
