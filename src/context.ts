import type { SourceReference } from "./integration-contracts.ts";
import type { Candidate, ContextPack, Requirement } from "./protocol.ts";
import { candidate, canonical, digest, hash, record, requireThat, textHash } from "./util.ts";
import { Workspace } from "./workspace.ts";
import { relative } from "node:path";
import { CONCEPT_ROOT } from "./ledger.ts";

export type SkillSelection = { id: string; contentHash: string; bundleHash?: string; originId?: string; path?: string };
export type ProvenanceContext = ContextPack & {
  workspacePath: string;
  sourceProvenance: SourceReference[];
  skillProvenance: SkillSelection[];
};
export type ContextSelection = Candidate & {
  requirements: Requirement[];
  corrections?: string[];
  sources: SourceReference[];
  skills?: SkillSelection[];
};
export type SkillVerifier = (selection: SkillSelection) => boolean;

function rehydrate(workspace: Workspace, ref: SourceReference): SourceReference {
  record(ref); digest(ref.contentHash);
  requireThat(typeof ref.path === "string" && Number.isSafeInteger(ref.lineStart) && Number.isSafeInteger(ref.lineEnd) && ref.lineStart > 0 && ref.lineEnd >= ref.lineStart && ref.lineEnd - ref.lineStart < 200, "INVALID_SOURCE_REFERENCE");
  const data = workspace.read(ref.path);
  requireThat(data.contentHash === ref.contentHash, "STALE_CONTEXT_SOURCE");
  const lines = data.text.split("\n");
  requireThat(ref.lineEnd <= lines.length, "INVALID_SOURCE_LINES");
  const text = lines.slice(ref.lineStart - 1, ref.lineEnd).join("\n");
  requireThat(text.length > 0 && Buffer.byteLength(text) <= 16000, "CONTEXT_SNIPPET_BUDGET");
  return { path: ref.path, contentHash: ref.contentHash, lineStart: ref.lineStart, lineEnd: ref.lineEnd, text };
}
function checkSkills(skills: SkillSelection[], verify?: SkillVerifier): void {
  requireThat(Array.isArray(skills) && skills.length <= 32, "INVALID_SKILL_SELECTION");
  for (const skill of skills) {
    record(skill); requireThat(typeof skill.id === "string" && skill.id.length > 0, "INVALID_SKILL_SELECTION"); digest(skill.contentHash);
    if (skill.bundleHash !== undefined) digest(skill.bundleHash);
    requireThat(verify && verify(skill), "STALE_OR_UNVERIFIED_SKILL");
  }
}

/** Re-read exact selected bytes. Search preview text is a selector, never authoritative content. */
export function buildContext(root: string, selection: ContextSelection, verifySkill?: SkillVerifier): { contextHash: string; pack: ProvenanceContext } {
  candidate(selection);
  requireThat(Array.isArray(selection.sources) && selection.sources.length > 0 && selection.sources.length <= 20, "INVALID_SOURCE_SELECTION");
  const workspace = new Workspace(root), sources = selection.sources.map(ref => rehydrate(workspace, ref));
  const skills = structuredClone(selection.skills ?? []); checkSkills(skills, verifySkill);
  const pack: ProvenanceContext = {
    schemaVersion: 1, candidateSHA: selection.candidateSHA, dirtyHash: selection.dirtyHash,
    workspacePath: relative(CONCEPT_ROOT, workspace.root),
    requirements: structuredClone(selection.requirements), corrections: structuredClone(selection.corrections ?? []),
    snippets: sources.map(ref => ({ path: ref.path, contentHash: textHash(ref.text), text: ref.text })),
    skills: skills.map(skill => ({ id: skill.id, contentHash: skill.contentHash })),
    sourceProvenance: sources, skillProvenance: skills,
  };
  requireThat(Buffer.byteLength(canonical(pack)) <= 64000, "CONTEXT_BUDGET");
  return { contextHash: hash(pack), pack };
}

/** Call immediately before storing/using a selected context. No cache or silent refresh. */
export function verifyContext(root: string, pack: ProvenanceContext, verifySkill?: SkillVerifier): void {
  candidate(pack);
  requireThat(pack.schemaVersion === 1 && Array.isArray(pack.sourceProvenance) && pack.sourceProvenance.length > 0 && pack.sourceProvenance.length <= 20 && Array.isArray(pack.snippets) && pack.sourceProvenance.length === pack.snippets.length, "INVALID_CONTEXT_PROVENANCE");
  const workspace = new Workspace(root);
  requireThat(pack.workspacePath === relative(CONCEPT_ROOT, workspace.root), "CONTEXT_WORKSPACE_MISMATCH");
  for (const [index, ref] of pack.sourceProvenance.entries()) {
    const actual = rehydrate(workspace, ref), snippet = pack.snippets[index]!;
    requireThat(canonical(actual) === canonical(ref) && snippet.path === actual.path && snippet.text === actual.text && snippet.contentHash === textHash(actual.text), "CONTEXT_PROVENANCE_MISMATCH");
  }
  checkSkills(pack.skillProvenance, verifySkill);
  requireThat(canonical(pack.skills) === canonical(pack.skillProvenance.map(skill => ({ id: skill.id, contentHash: skill.contentHash }))), "CONTEXT_SKILL_PROVENANCE_MISMATCH");
  requireThat(Buffer.byteLength(canonical(pack)) <= 64000, "CONTEXT_BUDGET");
}
