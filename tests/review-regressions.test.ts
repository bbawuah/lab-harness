import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callback, Ledger } from "../src/ledger.ts";
import { fixtureResult } from "../src/fixtures.ts";
import { canonical } from "../src/util.ts";
import { Workspace } from "../src/workspace.ts";
import { fresh } from "./helpers.ts";

test("a reviewed result ID cannot be replaced after settlement or reopening", () => {
  const f = fresh(); f.ledger.apply(callback(f.claim, 2, { kind: "started" }));
  const result = fixtureResult(f.ledger, "T1", f.bindingHash);
  f.ledger.apply(callback(f.claim, 3, { kind: "result", result }));
  f.ledger.apply(callback(f.claim, 4, { kind: "settled", aborted: false, failed: false }));
  const reviewed = f.ledger.get("T1"); f.ledger.close(); f.ledger = new Ledger(join(f.root, "lab"));
  const changed = structuredClone(result); changed.summary = "replacement the operator never reviewed";
  expect(() => f.ledger.apply(callback(f.claim, 5, { kind: "result", result: changed }))).toThrow("RESULT_ID_CONFLICT");
  expect(f.ledger.get("T1")).toEqual(reviewed);
  expect(f.ledger.accept("T1", result.resultId, f.contract, "reviewed original").result).toEqual(result);
});
for (const artifactFirst of [false, true]) test(`identical context/artifact bytes support both kinds, artifactFirst=${artifactFirst}`, () => {
  const f = fresh(), context = f.ledger.readContext(f.contract.contextHash);
  if (artifactFirst) context.corrections.push("new unique context bytes");
  const bytes = canonical(context);
  if (artifactFirst) f.ledger.artifact(bytes);
  const contextHash = f.ledger.context(context), artifactHash = f.ledger.artifact(bytes);
  expect(contextHash).toBe(artifactHash); expect(f.ledger.readContext(contextHash)).toEqual(context);
  const contract = { ...f.contract, taskId: "T2", contextHash }; f.ledger.create(contract);
  const bound = f.ledger.grant("T2", "S2"); f.ledger.apply(callback(bound.claim, 2, { kind: "started" }));
  const result = fixtureResult(f.ledger, "T2", bound.bindingHash);
  result.requirements[0]!.evidence[0]!.artifactHash = artifactHash;
  expect(f.ledger.apply(callback(bound.claim, 3, { kind: "result", result }))).toBe("processed");
});
test("binary and invalid UTF8 are reported while eligible text still matches", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace"));
  writeFileSync(join(w.root, "a.bin"), Buffer.from([0, 1])); writeFileSync(join(w.root, "b.dat"), Buffer.from([0xc3, 0x28])); writeFileSync(join(w.root, "z.txt"), "needle");
  const report = w.searchDetailed("needle"); expect(report.hits.map(h => h.path)).toEqual(["z.txt"]);
  expect(report.omissions.map(o => o.reason).sort()).toEqual(["BINARY_FILE", "INVALID_UTF8"]);
});
test("empty directories count against traversal cap and deep trees stop", () => {
  const f = fresh(), wide = new Workspace(join(f.root, "wide"));
  for (let i = 0; i < 1005; i++) mkdirSync(join(wide.root, `d${i}`));
  const report = wide.searchDetailed("needle"); expect(report.visitedEntries).toBe(1000); expect(report.truncated).toBe(true);
  const deep = new Workspace(join(f.root, "deep")); let path = deep.root;
  for (let i = 0; i < 25; i++) { path = join(path, "d"); mkdirSync(path); }
  writeFileSync(join(path, "hidden-by-depth.txt"), "needle");
  const depth = deep.searchDetailed("needle"); expect(depth.hits).toEqual([]); expect(depth.omissions).toContainEqual({ path: Array(21).fill("d").join("/"), reason: "depth-limit" });
});
test("unknown schema versions and incomplete initialization are refused without rewriting", () => {
  const f = fresh(), path = f.ledger.path; f.ledger.close();
  let db = new Database(path); db.exec("PRAGMA user_version=99"); db.close();
  const before = readFileSync(path); expect(() => new Ledger(join(f.root, "lab"))).toThrow("UNSUPPORTED_SCHEMA_VERSION"); expect(readFileSync(path)).toEqual(before);
  db = new Database(path); db.exec("PRAGMA user_version=1"); db.close(); f.ledger = new Ledger(join(f.root, "lab"));
  const partial = join(f.root, "partial"); mkdirSync(partial); const partialPath = join(partial, "ledger.sqlite"); writeFileSync(partialPath, "");
  expect(() => new Ledger(partial)).toThrow("UNKNOWN_DATABASE"); expect(readFileSync(partialPath)).toHaveLength(0);
});
