# Local skills inventory and explicit import

`src/skills/index.ts` inventories local instructions as data. It does not invoke
skills, import their scripts, run commands, install tools, alter settings, or
contact services. Import returns verified instruction text to the explicit
caller. No bundles are copied. Compatibility describes dependencies; it grants
neither execution authority nor redistribution permission.

## Current read-only inventory

`skills-inventory.json` records the scan on 2026-10-29 with source aliases
`codex-user`, `claude-user`, and `repo-portable`. Local root paths are operator
inputs in an ignored `.tmp` manifest, absent from the committed report.

All **47 current origins** in the selected discovery scope are accounted for:

- 18 Codex user skills, including five hidden `.system` skills.
- 22 Claude user skills, including 13 nested synced bundles and three instruction
  symlinks.
- Seven repository entries: the three `agents/skills` bundles, `bekijk`, a hidden
  Storybook bundle, and two repository `AGENTS.md` documents.

`coverageComplete: true` means candidate discovery in the selected scope omitted
no entries. `contentComplete: false` means some instruction/resource bytes could
not be read within the selected scope. `truncated: false`, zero dropped
diagnostics, and the recorded limits make the coverage claim inspectable.
The legacy `complete` field aliases `contentComplete`; consumers should use the
two explicit completeness fields. Each record also has bundle `complete` and
`loadable` fields describing local byte inventory, not operational capability.

The three unavailable instruction links are Claude `grill-me`, `react-grab`, and
`vault`. Inspection of link targets found all three outside both supplied skill
roots and the supplied repository. Their link byte hashes and precise
`INSTRUCTION_SYMLINK_OUTSIDE_SELECTED_ROOTS` diagnostics are retained; their
target contents are not read or published. They remain origin coverage entries
without fabricated instruction hashes. No resource symlink leaving its bundle
is followed.

The report preserves 47 distinct bundle identities. Two duplicate instruction
body groups remain visible: `lead` occurs across three different bundles and
`retro` across two. Nine name conflicts preserve every variant. An identical
instruction body never conceals different supporting resources or origins.

Classification totals, counted by origin, are two portable, seven with local
dependencies, 25 needing connected services, and 13 proprietary or unavailable.
The latter includes the three unresolved links. Classifications are conservative
static hints from instructions and bounded supporting text. A locally readable
proprietary record may have `loadable: true`; this means its bytes can be
revalidated and returned locally, not that its license or vendor runtime permits
execution. No scripts/services were qualified by this scan.

## API

The API is synchronous so `verifySkill` can be used by the existing Context
module's synchronous verifier callback. Every type is exported from
`src/skills/index.ts`; shared origin/category types remain in integration contracts.

```ts
import {
  discoverSkills, selectSkill, loadSkill, verifySkill,
  type SkillSource, type SkillsInventory,
} from "../src/skills/index.ts";

// Supplied by the local operator, never committed with actual local paths.
const origins: SkillSource[] = operatorManifest.origins;
const inventory: SkillsInventory = discoverSkills(origins);
const record = inventory.skills.find(s => s.loadable && s.name === "wanted")!;
const selection = selectSkill(record, record.origins[0]);
const valid: boolean = verifySkill(selection, origins, inventory);
const imported = loadSkill(selection, origins, inventory);
// imported.text contains instructions: do not log or publish it.
// Context callback: selection => verifySkill(selection, origins, inventory)
```

`discoverSkills(origins, limits?)` returns sanitized metadata, hashes, conflicts,
duplicate bodies, explicit root states, exclusions, diagnostics, limits and counts.
`SkillSource` extends `{ id, root }` with optional `kind: "skills" | "repository"`
and an operator-supplied hexadecimal `sourceRevision`. IDs are source aliases;
roots must be absolute local directories. Duplicate aliases are rejected.

`selectSkill(record, location?)` returns the existing Context-compatible
`{ id, contentHash, bundleHash, originId, path }`. Always retain this full
selection. `path` is instruction-relative to the source alias. IDs bind full
bundle identities, not just names. Selecting an ambiguous duplicate without
origin/path fails; a stale origin cannot fall back to an unchanged duplicate.

`loadSkill(selection, origins, inventory?)` returns `{ selection, text, skill }`.
It re-discovers the exact selected origin, compares instruction and whole-bundle
byte identities, reads the instruction, and verifies again. Missing, changed,
added, deleted or renamed resources/scripts invalidate the selection. Without
a baseline inventory, `bundleHash`, `originId`, and `path` are mandatory.
`verifySkill(selection, origins, inventory?)` performs the same identity checks
without returning text and returns false on failure. Loader errors contain stable
codes rather than local paths or bodies.

## Discovery and identity rules

Hidden directories are included. A directory containing `SKILL.md` is a bundle;
its entire resource tree is inventoried. Repository mode additionally finds
`AGENTS.md`, `CLAUDE.md`, and Markdown agent definitions under agent directories.
Standalone agent guidance is a one-file bundle, not the surrounding repository.
Root metadata such as sync manifests and the Codex system marker receive hashes.
Package versions, safe frontmatter versions, license-file hashes, operator source
revision and sanitized declared source links provide provenance. Unspecified
versions remain null; a hash does not establish authorship or a reuse license.
The link field is named `publicSourceLinks` for its public source-host allowlist;
link accessibility/ownership has not been independently verified.

File identities use SHA-256 over exact bytes. Bundle identity hashes the sorted
resource records, including relative paths, kinds, file sizes, file hashes, link
hashes, directory structure and availability state. Bodies with different bundle
identities remain separate. Exact bundles combine origins without dropping them.
All published paths are relative to aliases or bundles. Source bodies, resource
contents, raw symlink targets, and local root paths are not returned by discovery.

Skill directory links and instruction links into any explicitly selected source
root can be inventoried as references. The effective target bundle is hashed,
the original origin is retained, and the sanitized target alias/path is recorded.
External targets remain unresolved. Resource file links are allowed only within
the effective selected bundle; their link and target bytes are hashed. Directory
resource links are retained but not followed, so loops cannot expand traversal.
Sensitive filenames are never opened, including through an innocently named
link. Their presence makes the bundle incomplete and prevents loading.

Discovery excludes dependency/build directories and repository worktree/session
storage. Exact encountered exclusions are recorded, rather than scanning another
checkout or the user's session data. These are discovery scope boundaries, not
missing current origins. Excluded subtrees *within a bundle* prevent a complete
bundle claim. Bounds cover traversal entries/depth, bundle entries, individual
file bytes, total bytes, and diagnostics. Missing roots and traversal omissions
make coverage incomplete; resource omissions make content incomplete. Byte/depth
or entry limits set `truncated`; suppressed diagnostics are counted.

The reader rejects binary/invalid UTF-8 instructions and unsafe relative paths.
File handles use no-follow/nonblocking reads with file identity checks; final
instruction reads are rehashed and the bundle is checked again. This detects
ordinary edits, not an atomic filesystem snapshot against a hostile process
concurrently replacing directory ancestors. Static dependency classification
does not resolve every dynamic import, external file reference, interpreter or
vendor-specific tool. Unbundled dependencies remain adaptation work. Classification
and sealed hashes are evidence, not a security sandbox.

## Regenerating the report

Create an operator manifest in ignored `.tmp` containing `origins`. Supply the
three aliases above and actual local roots privately; use repository mode for
the repository source. Then run:

```sh
bun --no-env-file --no-install scripts/inventory-skills.ts \
  .tmp/skills-origins.json docs/skills-inventory.json
```

The script prints counts only. A successful scan can still have unavailable
entries; inspect the two completeness flags and diagnostics. Read/parse failures
exit nonzero with a sanitized error. Inspect the generated metadata before
publication; no redistribution permission is inferred and no bundle copy is
required for local reference import.

Verification uses disposable fixture roots outside the checkout, never modifies
the inventoried sources, and covers duplicate origins/bodies, conflicting bundles,
all resource mutation classes, approved/unapproved links, loops, traversal,
resource privacy, inert commands, service classification, bounds and integration
with Context invalidation. Actual inventory is read-only metadata evidence;
fixture tests and operational qualification remain distinct.
