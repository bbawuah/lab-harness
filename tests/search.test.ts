import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONCEPT_ROOT } from "../src/ledger.ts";
import { SearchService, type SearchOptions } from "../src/search/index.ts";

const roots: string[] = [];
function fixture(options: SearchOptions = {}) {
  mkdirSync(join(CONCEPT_ROOT, ".tmp"), { recursive: true });
  const root = mkdtempSync(join(CONCEPT_ROOT, ".tmp/search-")); roots.push(root);
  const search = new SearchService(join(root, "workspace"), options);
  const put = (path: string, data: string | Buffer) => {
    const full = join(search.root, path); mkdirSync(join(full, ".."), { recursive: true }); writeFileSync(full, data); return full;
  };
  return { root, search, put };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const rgAvailable = spawnSync("rg", ["--version"], { timeout: 1000, maxBuffer: 1024 }).status === 0;

test("interactive root access is explicit and retains source exclusions", () => {
  expect(() => new SearchService(CONCEPT_ROOT)).toThrow("STATE_OUTSIDE_CONCEPT");
  const search = new SearchService(CONCEPT_ROOT, { allowRepositoryRoot: true, limit: 2 });
  expect(search.files(".bun-version").hits[0]!.path).toBe(".bun-version");
  expect(search.files(".env").hits).toEqual([]);
  expect(() => new SearchService("/", { allowRepositoryRoot: true })).toThrow("STATE_OUTSIDE_CONCEPT");
});

test("literal metacharacters, flags and Unicode are inert, case-sensitive strings", () => {
  const { search, put } = fixture();
  const line = "literal [a-z].* $(touch sentinel) --help café 中文 🙂";
  put("example.ts", line + "\nCAFE");
  for (const query of ["[a-z].*", "$(touch sentinel)", "--help", "café", "中文", "🙂"]) {
    const report = search.text(query); expect(report.hits).toHaveLength(1); expect(report.hits[0]!.text).toBe(line); expect(search.verify(report.hits[0]!)).toBe(true);
  }
  expect(search.text("Café").hits).toEqual([]);
});

test("working-byte hashes preserve UTF8 BOM, CRLF and relative line provenance", () => {
  const { search, put } = fixture();
  const bytes = Buffer.from("\uFEFFheader\r\nneedle café\r\nneedle"); put("nested/guide.md", bytes);
  const report = search.text("needle");
  expect(report.hits.map(h => [h.path, h.lineStart, h.lineEnd, h.text])).toEqual([["nested/guide.md", 2, 2, "needle café\r"], ["nested/guide.md", 3, 3, "needle"]]);
  expect(report.hits[0]!.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(search.text("\uFEFF").hits[0]!.text.charCodeAt(0)).toBe(0xfeff);
});

test("file search matches literal basename and references actual source line one", () => {
  const { search, put } = fixture(); put("src/needle[1].ts", "first\nsecond"); put("needle-dir/other.ts", "needle"); put("empty.txt", "");
  expect(search.files("needle[1]").hits).toEqual([{ path: "src/needle[1].ts", contentHash: createHash("sha256").update("first\nsecond").digest("hex"), lineStart: 1, lineEnd: 1, text: "first" }]);
  expect(search.files("needle-dir").hits).toEqual([]);
  const empty = search.files("empty").hits[0]!; expect(empty.text).toBe(""); expect(search.verify(empty)).toBe(true);
});

test("fresh searches and reference verification handle edit, rename and delete without an index", () => {
  const { search, put } = fixture(); const file = put("source.md", "needle"); const before = search.text("needle").hits[0]!;
  writeFileSync(file, "needle changed"); expect(search.verify(before)).toBe(false);
  const edited = search.text("needle").hits[0]!; expect(edited.contentHash).not.toBe(before.contentHash);
  renameSync(file, join(search.root, "renamed.md")); expect(search.verify(edited)).toBe(false);
  const renamed = search.text("needle").hits[0]!; expect(renamed.path).toBe("renamed.md");
  unlinkSync(join(search.root, "renamed.md")); expect(search.verify(renamed)).toBe(false); expect(search.text("needle").hits).toEqual([]);
});

test("sensitive names are excluded at every depth for both file and text search", () => {
  const { search, put } = fixture();
  for (const path of ["config.properties", "config.json", ".env", ".env.local", ".git/config", "node_modules/pkg/index.ts", ".tmp/cache", ".lab/state", "nested/config.json", "nested/.env.other"]) put(path, "canary");
  put("safe.md", "safe");
  expect(search.text("canary").hits).toEqual([]); expect(search.files("config").hits).toEqual([]);
  expect(search.verify({ path: "nested/config.json", contentHash: createHash("sha256").update("canary").digest("hex"), lineStart: 1, lineEnd: 1, text: "canary" })).toBe(false);
});

test("binary, malformed UTF8, symlinks and hardlinks are never returned", () => {
  const { root, search, put } = fixture();
  put("binary.dat", Buffer.from("needle\0secret")); put("invalid.txt", Buffer.from([0xc3, 0x28]));
  const original = put("hard.txt", "needle"); linkSync(original, join(search.root, "hard-copy.txt"));
  writeFileSync(join(root, "outside.txt"), "needle"); symlinkSync(join(root, "outside.txt"), join(search.root, "escape.txt"));
  symlinkSync(root, join(search.root, "escape-dir")); symlinkSync(join(root, "absent"), join(search.root, "dangling"));
  put("real/nested.txt", "needle"); symlinkSync(join(search.root, "real"), join(search.root, "alias"));
  const report = search.text("needle"); expect(report.hits.map(h => h.path)).toEqual(["real/nested.txt"]);
  expect(report.omissions.map(o => o.reason)).toContain("BINARY_FILE"); expect(report.omissions.map(o => o.reason)).toContain("INVALID_UTF8");
  for (const name of ["binary", "invalid", "hard", "escape", "alias", "dangling"]) expect(search.files(name).hits).toEqual([]);
});

test("forged, absolute, excluded and traversal references are refused", () => {
  const { search, put } = fixture(); put("source.md", "needle"); const ref = search.text("needle").hits[0]!;
  for (const path of ["../source.md", "/etc/passwd", "./source.md", "sub/../source.md", "source.md\0", "sub\\source.md"]) expect(search.verify({ ...ref, path })).toBe(false);
  expect(search.verify({ ...ref, lineStart: 0 })).toBe(false); expect(search.verify({ ...ref, lineEnd: 2 })).toBe(false); expect(search.verify({ ...ref, text: "fabricated" })).toBe(false);
  expect(() => new SearchService("/tmp/search-outside-clone")).toThrow("STATE_OUTSIDE_CONCEPT");
});

test("replaced root is refused before search or verification", () => {
  const { root, search, put } = fixture(); put("source.md", "needle"); const ref = search.text("needle").hits[0]!;
  renameSync(search.root, join(root, "old")); mkdirSync(search.root); writeFileSync(join(search.root, "source.md"), "needle");
  expect(search.verify(ref)).toBe(false); expect(() => search.text("needle")).toThrow("UNSAFE_SEARCH_ROOT");
});

test("sorting is deterministic across creation orders, paths and lines", () => {
  const { search, put } = fixture();
  for (const file of ["z.md", "c/z.md", "a.md", "c/a.md", "B.md"]) put(file, "needle\nneedle");
  const expected = ["B.md", "B.md", "a.md", "a.md", "c/a.md", "c/a.md", "c/z.md", "c/z.md", "z.md", "z.md"];
  expect(search.text("needle", { limit: 20 }).hits.map(h => h.path)).toEqual(expected);
  expect(search.text("needle", { limit: 20 })).toEqual(search.text("needle", { limit: 20 }));
});

test("result and snippet byte limits are exact and UTF8 safe", () => {
  const { search, put } = fixture(); put("a", "🙂🙂needle\nneedle\nneedle");
  const report = search.text("needle", { limit: 2, maxSnippetBytes: 5 });
  expect(report.hits).toHaveLength(2); expect(report.hits[0]!.text).toBe("🙂"); expect(report.truncated).toBe(true);
  expect(report.omissions).toContainEqual({ path: "a", reason: "result-limit" });
  expect(search.text("needle", { limit: 3 }).truncated).toBe(false);
});

test("entry overflow refuses arbitrary filesystem-order partial directories", () => {
  const { search, put } = fixture(); put("z", "needle"); put("a", "needle");
  expect(search.text("needle", { maxEntries: 1 })).toEqual({ hits: [], engine: "fallback", truncated: true, omissions: [{ path: "", reason: "entry-limit" }] });
  expect(search.text("needle", { maxEntries: 2 }).hits.map(h => h.path)).toEqual(["a", "z"]);
});

test("file, aggregate byte, depth and omission budgets are explicit", () => {
  const { search, put } = fixture(); put("a", "needle"); put("b", "needle"); put("deep/sub/file", "needle");
  expect(search.text("needle", { maxFileBytes: 5 }).hits).toEqual([]);
  expect(search.text("needle", { maxFileBytes: 5 }).truncated).toBe(true);
  const bytes = search.text("needle", { maxTotalBytes: 7 }); expect(bytes.hits.map(h => h.path)).toEqual(["a"]); expect(bytes.truncated).toBe(true);
  expect(search.text("needle", { maxDepth: 1 }).omissions).toContainEqual({ path: "deep/sub", reason: "depth-limit" });
  for (let n = 0; n < 110; n++) put(`config-${n}/config.json`, "secret");
  expect(search.text("absent").omissions).toHaveLength(100);
});

test("invalid queries and option budgets fail before traversal", () => {
  const { search } = fixture();
  for (const query of ["", "x".repeat(513), "a\nb", "a\rb", "\0", "\ud800"]) expect(() => search.text(query)).toThrow("INVALID_SEARCH");
  for (const options of [{ limit: 0 }, { limit: 1001 }, { maxEntries: Infinity }, { maxFileBytes: -1 }, { maxTotalBytes: NaN }, { maxDepth: 41 }, { maxSnippetBytes: 1.5 }]) expect(() => search.text("x", options)).toThrow("INVALID_SEARCH_OPTIONS");
});

test("explicit fallback never needs a subprocess and auto uses it", () => {
  const { search, put } = fixture(); put("safe", "needle");
  expect(search.text("needle", { engine: "fallback" }).engine).toBe("fallback"); expect(search.text("needle").engine).toBe("fallback");
  expect(search.files("safe", { engine: "rg" }).engine).toBe("fallback");
});

test.skipIf(!rgAvailable)("rg and fallback have identical filtering, literals, limits and byte provenance", () => {
  const { search, put } = fixture();
  put("a.md", "\uFEFFneedle café\r\n[a-z].*\n--help\n🙂"); put("b.md", "needle"); put("config.json", "needle"); put("nul", Buffer.from("needle\0")); put("bad", Buffer.from([0xff]));
  symlinkSync(join(search.root, "a.md"), join(search.root, "alias"));
  for (const query of ["needle", "café", "\uFEFF", "[a-z].*", "--help", "🙂", "absent"]) {
    for (const limits of [{}, { limit: 1 }, { maxEntries: 2 }, { maxTotalBytes: 3 }, { maxFileBytes: 5 }]) {
      const fallback = search.text(query, { ...limits, engine: "fallback" }), rg = search.text(query, { ...limits, engine: "rg" });
      expect(rg.engine).toBe("rg"); expect({ ...rg, engine: "fallback" }).toEqual(fallback);
    }
  }
});

test("rg missing or failing degrades to bounded canonical fallback", () => {
  const { search, put, root } = fixture(); put("safe", "needle");
  const bin = join(root, "bin"); mkdirSync(bin); writeFileSync(join(bin, "rg"), "#!/bin/sh\nexit 2\n", { mode: 0o700 });
  const saved = process.env.PATH;
  try {
    process.env.PATH = bin;
    expect(search.text("needle", { engine: "rg" })).toEqual(search.text("needle", { engine: "fallback" }));
    process.env.PATH = join(root, "absent");
    expect(search.text("needle", { engine: "rg" })).toEqual(search.text("needle", { engine: "fallback" }));
  } finally { process.env.PATH = saved; }
});

test("FIFO paths are omitted without opening a blocking stream", () => {
  const { search, put } = fixture(); put("safe.md", "needle");
  const created = spawnSync("mkfifo", [join(search.root, "pipe")], { timeout: 1000, maxBuffer: 1024 });
  expect(created.status).toBe(0);
  const result = search.text("needle"); expect(result.hits.map(h => h.path)).toEqual(["safe.md"]);
  expect(result.omissions).toContainEqual({ path: "pipe", reason: "UNSAFE_WORKSPACE_PATH" });
});

test("constructor refuses symbolic roots and symbolic ancestors", () => {
  const { root } = fixture(); mkdirSync(join(root, "actual")); symlinkSync(join(root, "actual"), join(root, "linked"));
  expect(() => new SearchService(join(root, "linked"))).toThrow("UNSAFE_STATE_PATH");
  expect(() => new SearchService(join(root, "linked/subroot"))).toThrow("UNSAFE_STATE_PATH");
});

test.skipIf(!rgAvailable)("rg attempt exhaustion resumes canonical fallback without losing hits", () => {
  const { search, put } = fixture();
  for (let n = 0; n < 130; n++) put(`${String(n).padStart(3, "0")}.txt`, n === 129 ? "needle" : "ordinary");
  const expected = search.text("needle", { engine: "fallback" });
  expect(search.text("needle", { engine: "rg" })).toEqual(expected);
});
