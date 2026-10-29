# Offline file and text search

`src/search/index.ts` exports `SearchService` and the shared `SourceReference` /
`SearchResult` contracts. No shared interface, CLI, ledger protocol or existing
`Workspace` behavior is changed by this module.

```ts
import { SearchService } from "../src/search/index.ts";

const search = new SearchService("/absolute/path/to/clone/workspace");
const text = search.text("agent_settled", { limit: 5 });
const files = search.files("rpc-commands.md");
for (const ref of text.hits) {
  if (!search.verify(ref)) throw new Error("Source changed; search again");
}
```

The root must satisfy the existing `ownedState` restriction: an actual directory
strictly below this module's project checkout. A missing root is created by that
helper. An arbitrary external directory or the checkout root itself is refused.
The service stays bound to the original root directory identity. A replaced root
is refused, even when the replacement contains identical bytes.

`text` performs case-sensitive literal substring matching on individual LF-separated
lines. It returns one hit per matching line, in sorted depth-first path order,
then ascending line number. Filename sorting uses JavaScript string ordering,
independent of locale and creation order. `files` performs case-sensitive literal
**basename** substring matching; directories themselves are not results. Neither
method treats the query as a regex, glob, command or SQL. Queries must contain
1–512 UTF-16 code units, valid Unicode, and no NUL, CR or LF.

Each reference has a slash-separated relative path, SHA-256 of the complete
original file bytes, and a one-based inclusive line span. Text hits identify one
line. Filename hits identify actual source line 1, including the empty first
line of an empty file. `text` is the UTF-8-safe bounded prefix of that source
line; a match late in a long line may lie beyond the prefix. CR from CRLF is
preserved, and a UTF-8 BOM remains U+FEFF in the first line. Hashing uses original
bytes, including BOM and line endings, rather than normalized text.

Options can be supplied to the constructor and overridden per call. The shared
contract options remain compatible. Additional byte/depth/snippet options are
exported by this module's `SearchOptions` type.

| Option | Default | Maximum |
| --- | ---: | ---: |
| `limit` | 5 hits | 1,000 hits |
| `maxEntries` | 10,000 entries | 100,000 entries |
| `maxFileBytes` | 1,048,576 bytes | 1,048,576 bytes |
| `maxTotalBytes` | 33,554,432 bytes | 268,435,456 bytes |
| `maxDepth` | 20 directory levels | 40 levels |
| `maxSnippetBytes` | 400 bytes | 4,096 bytes |

All numeric limits must be positive safe integers. Aggregate read budgeting
reserves each attempted source file's observed size plus one byte before reading;
that extra byte detects growth. Filename search reads only matching eligible
files. Entry budgeting includes directories, excluded entries, links and ordinary
files. Directory enumeration buffers at most the remaining entry budget. If a
directory exceeds that budget, none of that directory's arbitrary enumeration
prefix is searched, and traversal stops. Previously completed directories remain
in the result. This makes overflow behavior deterministic for an unchanged tree.
Depth overflow skips that subtree. Results stop upon observing a hit beyond
`limit`; exactly `limit` matches alone do not imply truncation.

`truncated` is true when a result, entry, depth, file-size or aggregate byte limit
leaves work incomplete. `omissions` reports at most 100 excluded/unsupported/
changed/limited paths, with stable reason codes. It is a bounded diagnostic
sample, not an exhaustive inventory. An oversized file can make the report
conservatively truncated even if it would not have matched. Policy exclusions,
binary files and invalid UTF-8 are omissions rather than matches. Permission
errors stop the search and propagate; engine fallback does not bypass them.

Eligibility applies to all descendant path components: `config.properties`,
`config.json`, `.env*`, `.git`, `.lab`, `.tmp`, and `node_modules` are excluded at
every depth. This explicit policy includes other hidden files and does not
interpret `.gitignore`; matching is independent of the installed git or rg ignore
configuration. All symlinks (including internal and dangling links), non-regular
files, and regular files with multiple hardlinks are refused. Supported content
is strict UTF-8 without NUL bytes, at most the configured file limit. Other file
formats receive no extraction or OCR. Valid UTF-8 text with non-NUL control
characters is not identified by a MIME detector and remains eligible.

Reads validate path ancestry, canonical location and file identity, use
`O_NOFOLLOW | O_NONBLOCK`, bound the read allocation, and compare descriptor/path
metadata before and after reading. Ancestors are checked again after opening
and after reading. Ordinary edit/replacement races yield omissions; a root change
or permission failure can stop the operation. These checks are a narrow source
adapter, not an OS filesystem sandbox against a hostile concurrent process
mutating directory ancestors. Host filesystem permissions and the existing host
guard remain necessary. Linux/WSL and macOS provide the required descriptor flags;
this implementation has been exercised locally on macOS, not yet on WSL.

`engine: "auto"` and `engine: "fallback"` use the bounded in-process scanner.
`engine: "rg"` optionally uses ripgrep as a literal existence prefilter on already
validated bytes sent through stdin. It never asks rg to traverse or reopen a
source path. Fixed argv, `--no-config`, `--encoding none`, `--fixed-strings`,
`--quiet`, `--text`, and `--` keep matching independent of shell syntax, BOM
conversion and user rg configuration. Stdout/stderr are discarded, each process
has a one-second timeout, and at most 128 processes are attempted per search.
Missing/failing/timed-out rg, or exhaustion of that attempt budget, resumes the
same canonical scanner and reports `engine: "fallback"`. Canonical snippets and
hashes always come from the validated bytes. Filename search always reports
`fallback`. This optional subprocess prefilter is not claimed to be faster.

Every search reads the current working bytes without a persistent index. An edit
changes the hash, a deletion removes the result, and a rename yields a new path.
`verify(ref)` rechecks eligibility, hash, line span and source-line prefix, returning
false for changed/deleted/renamed paths and invalid references. It accepts this
service's single-line references; it is not a generic multiline context validator.
The constructor's file-size bound also applies to verification. Identical bytes
restored at the same path have the same content identity. Verification is a
point-in-time observation; consumers must revalidate when binding a context and
must not assume later freshness. No watchers, stale cache, rename tombstones,
embeddings or graph dependencies are involved.

# Repeatable FTS5 comparison

Run the benchmark separately from correctness tests:

```sh
bun --no-env-file --no-install scripts/benchmark-search.ts
# Optional measured repetitions per query (1–25; default 7), plus one warmup:
bun --no-env-file --no-install scripts/benchmark-search.ts 7
```

The script generates original synthetic TypeScript worker modules and Markdown
operator guides in disposable project-local state, then removes the fixture and
SQLite file. It performs no network/model calls or third-party source copying.
The fixed corpus has 266 files and 943,523 UTF-8 bytes. Its identity is SHA-256 of
sorted `path + NUL + content + NUL` records:
`36374a7b10adc5c39620396c6737f245aeed9f6487717f8e20fdc9108bcf24ea`.
A sensitive-config canary is outside the corpus manifest and checked for leakage.

FTS5 availability is established by actual `CREATE VIRTUAL TABLE ... USING fts5`,
insertion and a successful `MATCH` query, rather than inferred from SQLite's
version. The comparison uses a normal content-bearing FTS5 table, default
`unicode61` tokenizer, bound quoted-phrase queries, and BM25 ascending then path
ordering. Exact search is the production fallback, reduced to its first five
distinct paths. Each query has a manually specified expected document. The JSON
report includes exact/FTS paths, Recall@5, precision, median query costs, build
cost, on-disk size and known-one-file refresh cost. It checks source verification
after editing that file. Tests separately cover deletes and renames.

Actual local run: Bun 1.4.2, SQLite 3.54.0, macOS arm64, seven measured repeats
and one warmup. FTS5 was available. Build including validated source acquisition
cost 63.31 ms; the index occupied 1,286,144 bytes. A known single-file update cost
6.47 ms, excluding change discovery. Exact search requires no index build. These
are observations from one warm synthetic run, not performance guarantees.

| Literal query | Expected path | Exact recall | FTS recall | Exact median ms | FTS raw / verified median ms |
| --- | --- | ---: | ---: | ---: | ---: |
| `rpc-commands.md` (filename) | `docs/rpc-commands.md` | 1 | 1 | 5.984 | 0.044 / 0.120 |
| `agent_settled` | `src/events.ts` | 1 | 1 | 25.182 | 0.048 / 0.189 |
| `createGrepToolDefinition` | `src/grep.ts` | 1 | 1 | 25.329 | 0.037 / 0.107 |
| `GrepTool` | `src/grep.ts` | 1 | 0 | 25.516 | 0.026 / 0.026 |
| `cancel queued` | `docs/cancellation.md` | 1 | 1 | 25.208 | 0.040 / 0.115 |
| `idle geen taakacceptatie` | `docs/acceptance-nl.md` | 1 | 1 | 25.750 | 0.045 / 0.116 |
| `approved MOD transfer` | `docs/transfer.md` | 1 | 1 | 25.201 | 0.034 / 0.104 |
| `foo.bar()` | `src/punctuation.ts` | 1 | 1 | 25.378 | 0.037 / 0.173 |
| `café` | `docs/unicode.md` | 1 | 1 | 25.210 | 0.035 / 0.173 |
| `NEEDLE` | `docs/case.md` | 1 | 1 | 25.120 | 0.031 / 0.167 |

Mean Recall@5 was 1.0 for exact search and 0.9 for FTS5. FTS missed the identifier
substring `GrepTool`. For `agent_settled`, `foo.bar()`, `café`, and `NEEDLE`, FTS
also returned `docs/token-distractors.md`, reducing precision from 1 to 0.5 for
those queries: token punctuation, diacritic and case handling differ from literal
substring matching. The filename query searches FTS's path field, which is also
a different general semantic from the service's basename-only search.

FTS query timings are much lower on this unchanged fixture. The verified timing
rehashes only returned documents and checks their first-line references; it does
not discover changed/deleted/renamed/excluded sources across the corpus. Exact
search performs traversal, validation, hashing and current-byte matching on every
call. End-to-end reconciliation, concurrency, cold caches, larger real repositories
and WSL have not been benchmarked. No hybrid was implemented or measured, and no
hybrid benefit is claimed. Exact search remains the default; a disposable FTS
index is deferred until a measured workload justifies its freshness machinery.

Correctness commands:

```sh
bun --no-env-file --no-install test tests/search.test.ts
bun --no-env-file --no-install test ./tests
bun --no-env-file run typecheck
```

The benchmark has no timing assertions and is not part of correctness tests.
Publication allowlists, CLI wiring, context integration and CI belong to the
coordinator.
