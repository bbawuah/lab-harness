/** Repeatable synthetic code/docs corpus. No third-party source, models or downloads. */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONCEPT_ROOT } from "../src/ledger.ts";
import { SearchService, type SourceReference } from "../src/search/index.ts";

type Query = { query: string; kind: "text" | "files"; expected: string[] };
const queries: Query[] = [
  { query: "rpc-commands.md", kind: "files", expected: ["docs/rpc-commands.md"] },
  { query: "agent_settled", kind: "text", expected: ["src/events.ts"] },
  { query: "createGrepToolDefinition", kind: "text", expected: ["src/grep.ts"] },
  { query: "GrepTool", kind: "text", expected: ["src/grep.ts"] },
  { query: "cancel queued", kind: "text", expected: ["docs/cancellation.md"] },
  { query: "idle geen taakacceptatie", kind: "text", expected: ["docs/acceptance-nl.md"] },
  { query: "approved MOD transfer", kind: "text", expected: ["docs/transfer.md"] },
  { query: "foo.bar()", kind: "text", expected: ["src/punctuation.ts"] },
  { query: "café", kind: "text", expected: ["docs/unicode.md"] },
  { query: "NEEDLE", kind: "text", expected: ["docs/case.md"] },
];
const corpus = new Map<string, string>();
for (let module = 0; module < 192; module++) {
  const name = `module${String(module).padStart(3, "0")}`;
  const lines = [`/** Owned worker ${name}: bounded dispatch and evidence handling. */`, 'type Work = { id: string; attempt: number; state: "ready" | "complete" };', 'type Observation = { workId: string; accepted: false; detail: string };'];
  for (let operation = 0; operation < 12; operation++) lines.push(`export function observe${operation}(work: Work): Observation {`, `  // Observation ${operation} is advisory; the operator retains task authority.`, `  if (work.attempt > ${operation + 2}) return { workId: work.id, accepted: false, detail: "attempt bound" };`, `  return { workId: work.id, accepted: false, detail: "${name} observation ${operation}" };`, `}`, "");
  corpus.set(`src/modules/${name}.ts`, lines.join("\n"));
}
for (let guide = 0; guide < 64; guide++) {
  const lines = [`# Operator guide ${guide}`, "", "The ledger records immutable contracts and candidate evidence. A successful worker does not accept its task.", ""];
  for (let step = 0; step < 12; step++) lines.push(`## Step ${step + 1}`, "", `Inspect observation ${guide}-${step}, validate source bytes and compare the recorded attempt. Report an unknown outcome when a process cannot be observed.`, "", "Keep local state within the owned checkout. Review source provenance before selecting a context packet.", "");
  corpus.set(`docs/guides/guide${String(guide).padStart(3, "0")}.md`, lines.join("\n"));
}
for (const [path, body] of Object.entries({
  "docs/rpc-commands.md": "# RPC commands\nUse the structured worker protocol for dispatch and cancellation.\n",
  "src/events.ts": 'export const settledEvent = "agent_settled";\n',
  "src/grep.ts": 'export function createGrepToolDefinition() { return { name: "literal-source-search" }; }\n',
  "docs/cancellation.md": "# Cancellation\nTo cancel queued work, remove the pending request before dispatch.\n",
  "docs/acceptance-nl.md": "# Acceptatie\nWaarom is idle geen taakacceptatie? Alleen de operator accepteert het bewijs.\n",
  "docs/transfer.md": "# Transfer\nThe approved MOD transfer procedure requires operator-selected documents.\n",
  "src/punctuation.ts": "// Exact syntax example: foo.bar()\n",
  "docs/unicode.md": "# Unicode\nInspect the café document with original UTF-8 bytes.\n",
  "docs/case.md": "# Case\nThe uppercase sentinel is NEEDLE.\n",
  "docs/token-distractors.md": "# Token distractors\nAn agent settled quietly. A cafe is open. A lowercase needle differs. The tokens foo bar appear separately.\n",
})) corpus.set(path, body);
const manifest = [...corpus].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const corpusHash = createHash("sha256");
for (const [path, content] of manifest) { corpusHash.update(path); corpusHash.update("\0"); corpusHash.update(content); corpusHash.update("\0"); }
const repeats = Number(process.argv[2] ?? 7);
if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 25) throw new Error("Pass an iteration count from 1 to 25");
mkdirSync(join(CONCEPT_ROOT, ".tmp"), { recursive: true });
const temp = mkdtempSync(join(CONCEPT_ROOT, ".tmp/search-benchmark-"));
let db: Database | undefined;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
try {
  const root = join(temp, "workspace");
  for (const [path, body] of manifest) { const full = join(root, path); mkdirSync(join(full, ".."), { recursive: true }); writeFileSync(full, body); }
  // Canary is deliberately outside the corpus/index manifest and must never be retrieved.
  writeFileSync(join(root, "config.json"), '"EXCLUDED_BENCHMARK_CANARY"');
  const search = new SearchService(root, { engine: "fallback", limit: 1000 });
  const indexPath = join(temp, "benchmark.sqlite");
  db = new Database(indexPath);
  const sqliteVersion = (db.query("SELECT sqlite_version() AS version").get() as { version: string }).version;
  // Actual virtual-table creation and MATCH probe verify FTS5; a version string is insufficient.
  db.exec("CREATE VIRTUAL TABLE probe USING fts5(body); INSERT INTO probe VALUES ('availability');");
  if ((db.query("SELECT count(*) AS n FROM probe WHERE probe MATCH 'availability'").get() as { n: number }).n !== 1) throw new Error("FTS5 MATCH unavailable");
  db.exec("DROP TABLE probe; VACUUM;");
  const buildStart = performance.now();
  db.exec("CREATE VIRTUAL TABLE corpus USING fts5(path, body, contentHash UNINDEXED, tokenize='unicode61');");
  const insert = db.prepare("INSERT INTO corpus(path, body, contentHash) VALUES (?, ?, ?)");
  const sourceRefs = search.files(".");
  if (sourceRefs.truncated || sourceRefs.hits.length !== corpus.size) throw new Error("Fixture eligibility budget was exceeded");
  db.transaction(() => {
    for (const ref of sourceRefs.hits) {
      if (!search.verify(ref)) throw new Error("Fixture source changed before indexing");
      insert.run(ref.path, readFileSync(join(root, ref.path), "utf8"), ref.contentHash);
    }
  })();
  const buildMs = performance.now() - buildStart;
  const fts = db.prepare("SELECT path, body, contentHash FROM corpus WHERE corpus MATCH ? ORDER BY bm25(corpus), path LIMIT 5");
  const evaluateFts = (q: Query): SourceReference[] => {
    // A bound MATCH phrase, with its column selected by trusted code. No user SQL/FTS operators.
    const expression = `${q.kind === "files" ? "path" : "body"} : "${q.query.replaceAll('"', '""')}"`;
    return (fts.all(expression) as { path: string; body: string; contentHash: string }[]).map(row => ({ path: row.path, text: row.body.split("\n")[0]!.slice(0, 400), lineStart: 1, lineEnd: 1, contentHash: row.contentHash }));
  };
  const rows = queries.map(q => {
    const literalMs: number[] = [], ftsRawMs: number[] = [], ftsVerifiedMs: number[] = [];
    let exactPaths: string[] = [], ftsPaths: string[] = [];
    for (let n = -1; n < repeats; n++) {
      let start = performance.now();
      const exact = search[q.kind](q.query); if (exact.truncated) throw new Error(`Exact query truncated: ${q.query}`);
      exactPaths = [...new Set(exact.hits.map(h => h.path))].slice(0, 5);
      const exactElapsed = performance.now() - start;
      start = performance.now(); const indexed = evaluateFts(q); const rawElapsed = performance.now() - start;
      ftsPaths = indexed.filter(ref => search.verify(ref)).map(ref => ref.path); const verifiedElapsed = performance.now() - start;
      if (n >= 0) { literalMs.push(exactElapsed); ftsRawMs.push(rawElapsed); ftsVerifiedMs.push(verifiedElapsed); }
    }
    const recall = (paths: string[]) => q.expected.filter(path => paths.includes(path)).length / q.expected.length;
    const precision = (paths: string[]) => paths.length ? paths.filter(path => q.expected.includes(path)).length / paths.length : 0;
    return { ...q, exactPaths, ftsPaths, exactRecallAt5: recall(exactPaths), ftsRecallAt5: recall(ftsPaths), exactPrecisionAt5: precision(exactPaths), ftsPrecisionAt5: precision(ftsPaths), medianExactMs: median(literalMs), medianFtsRawMs: median(ftsRawMs), medianFtsVerifiedMs: median(ftsVerifiedMs) };
  });
  if (search.text("EXCLUDED_BENCHMARK_CANARY").hits.length || evaluateFts({ query: "EXCLUDED_BENCHMARK_CANARY", kind: "text", expected: [] }).length) throw new Error("Excluded source leaked");
  const stale = search.text("agent_settled").hits[0]!;
  writeFileSync(join(root, stale.path), 'export const settledEvent = "agent_observed";\n');
  if (search.verify(stale) || search.text("agent_settled").hits.length) throw new Error("Freshness regression");
  const refreshStart = performance.now();
  const changed = search.files("events.ts").hits[0]!;
  db.transaction(() => { db!.prepare("DELETE FROM corpus WHERE path = ?").run(changed.path); insert.run(changed.path, readFileSync(join(root, changed.path), "utf8"), changed.contentHash); })();
  const refreshMs = performance.now() - refreshStart;
  const mean = (key: "exactRecallAt5" | "ftsRecallAt5") => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  console.log(JSON.stringify({ schemaVersion: 1, fixture: "synthetic-owned-code-docs-v1", bunVersion: Bun.version, platform: process.platform, arch: process.arch, sqliteVersion, fts5Available: true, tokenizer: "unicode61 defaults", corpusHash: corpusHash.digest("hex"), corpusFiles: corpus.size, corpusBytes: manifest.reduce((sum, [, body]) => sum + Buffer.byteLength(body), 0), repeats, warmups: 1, exactIndexBuildMs: 0, ftsBuildIncludingValidatedSourceReadsMs: buildMs, ftsIndexBytes: statSync(indexPath).size, singleFileReconcileMs: refreshMs, exactMeanRecallAt5: mean("exactRecallAt5"), ftsMeanRecallAt5: mean("ftsRecallAt5"), queries: rows, limitations: ["Warm synthetic corpus; not a user workload or WSL measurement", "Exact results use sorted distinct paths; FTS uses BM25 document ranking", "FTS phrase tokenization differs from case-sensitive literal substring", "FTS verified timings rehash only returned files; they do not reconcile the whole corpus", "Build includes table creation and validated fixture source acquisition; fixture generation excluded", "Single-file refresh uses known changed path; change discovery not included", "No production index or hybrid benefit established"] }, null, 2));
} finally { db?.close(); rmSync(temp, { recursive: true, force: true }); }
