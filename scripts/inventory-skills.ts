import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { discoverSkills, type SkillSource } from "../src/skills/index.ts";

/** This script accepts an operator manifest; it has no ambient home-directory defaults. */
export function inventorySkills(manifestPath: string, outputPath: string): void {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!manifest || typeof manifest !== "object" || !Array.isArray((manifest as { origins?: unknown }).origins)) throw new Error("INVALID_SKILL_MANIFEST");
  const report = discoverSkills((manifest as { origins: SkillSource[] }).origins);
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  // Counts only. Never log raw source roots, instruction bodies, resource text or errors from sources.
  console.log(JSON.stringify({ coverageComplete: report.coverageComplete, contentComplete: report.contentComplete, truncated: report.truncated, ...report.coverage, diagnostics: report.diagnostics.length, diagnosticsDropped: report.diagnosticsDropped }));
}
if (import.meta.main) {
  const [manifest, output, ...extra] = process.argv.slice(2);
  if (!manifest || !output || extra.length) throw new Error("Usage: bun --no-env-file scripts/inventory-skills.ts <operator-manifest> <sanitized-report>");
  try { inventorySkills(manifest, output); }
  catch { console.error("SKILL_INVENTORY_FAILED: check operator inputs locally; source details withheld"); process.exitCode = 1; }
}
