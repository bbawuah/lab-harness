# Interactive installation evidence

The implementation continues main `83c18d8` in PR #7. This records actual
observations separately from fixture tests and from controlled task execution.

## Current caller-project flow

At source `5ed473c`, the actual TUI launched from an unrelated disposable
`project B with spaces`, with runtime code in A and private app state outside
both directories. Native Pi's session cwd matched B. The local model answered
`READY`; `/lab-search` returned B-only.md with its exact byte hash and excluded
the fixture .env; `/lab-skills` found B's skill and `/lab-skill` loaded its
verified body. Resize and `/exit` returned 0 with server/client/worker/socket
cleanup all true. Native Pi's project trust prompt was preserved; the validation
operator trusted only the disposable fixture. An initial automation attempt
sent its prompt to that modal and was not counted as model evidence.
[Sanitized events](evidence/project-events.json) and
[actual terminal stream](evidence/project-terminal.ansi) retain this observation.

The public bootstrap now pins runtime source
`5ed473cca54de6275acc51aac1a53308358697ec` at the exact full-commit codeload URL,
archive SHA-256 `fbb50acec187dd0835d58c1c253600cbf1527d85192272722e493ac862f39a49`.
This source includes the caller-project implementation and named-terminal fix.
The wrapper's distribution pin is separate from the commit containing the wrapper,
so the archive hash has no circular dependency on itself.

The final hosted test ran the immutable candidate bootstrap from B with a fresh
user HOME and system-only PATH, installed runtime A from the pinned archive,
completed hidden-key route setup and native folder trust, then passed the same
prompt/search/project-skill/exit checks. The quoted absolute launcher subsequently
ran `--offline` from B, returned `READY` and B-only source hits, and exited 0.
All **4,978 installed entries** had unchanged recorded path/type/mode/size/mtime/
ctime metadata; startup separately verifies executable/bundle byte identities.
Both runs verified complete owned process/socket cleanup.
[Hosted and subsequent evidence](evidence/hosted-project.json),
[first-run terminal](evidence/hosted-project-terminal.ansi) and
[subsequent terminal](evidence/subsequent-project-terminal.ansi) retain the
sanitized observations. State and sessions remained outside A and B.

The current bound-project bridge also passed an actual native Pi JSON/print
model tool round trip with the reduced prompt and only `lab_search`: model
call → B-only.md hashed result → final model answer. [Native tool events](evidence/bound-project-tool-events.jsonl).
This is distinct from the full TUI's prompt and operator command evidence.

The integrated caller-project check passed **190 tests**, TypeScript and
publication integrity, retaining all nine Relay pins. Fresh independent round 3
reviewed `5ed473c`, passed 17 focused tests and approved project binding, private
state, read-only launch, named-terminal handling and README readability/commands.
Its only blocker was the older runtime pin in that source snapshot. Commit
`0b7b879` changed only the bootstrap's commit/hash literals plus docs/evidence/
publication metadata, closing that blocker with the reviewed runtime. No runtime,
CLI or README implementation changed after `5ed473c`.

## Earlier bounded integration observations

The development mini ran the official pinned Pi 1.4.0 standalone and Herdr
0.9.5. A fresh TUI launch used `./lab` with PATH restricted to system utilities,
without global Bun/Pi/Node. It bootstrapped Bun locally, prompted for an explicit
loopback endpoint/model and private blank key, and opened the persistent branded
workspace. Subsequent `./lab --offline` returned the local model's `READY`, ran
`/lab-search explicit operator acceptance` and `/lab-skills`, resized from
110×36 to 80×24 and back, and exited through `/exit` with status 0. The owned
attachment records verified server/client/worker exit and both sockets removed.
The [sanitized actual terminal byte stream](evidence/interactive-terminal.ansi)
retains terminal controls; it is not a pixel screenshot or a fixture rendering.
Only OSC titles/links, local root paths and per-run IDs were removed/replaced.

A separate actual Pi JSON/print run used the same local endpoint and LAB
extension, a reduced system prompt and only `lab_search`. Pi received a native
model tool call, executed the real LAB bridge, returned hashed source hits, and
received the final answer `README.md`. The [native events](evidence/pi-local-tool-events.jsonl)
retain tool arguments and result bytes. Initial tiny-model outputs in the full
TUI emitted tool-call JSON as text or guessed a filename; they are not counted
as tool execution. The successful reduced-prompt run does not qualify general
coding/tool reliability of this 0.6B model under the full default TUI prompt.
A small direct loopback diagnostic also checked backend tool parsing; the
published tool round trip itself ran through Pi.

[Runtime and model identities](evidence/local-runtime.json) record the official
Apache-2.0 Qwen3-0.6B Q8_0 weights, immutable Hugging Face revision and SHA-256.
The 639,446,688-byte download was explicit validation work, never part of install.
The owned llama.cpp server listened only on loopback with four CPU threads,
zero GPU layers, one slot, 8,192 context tokens and a 256-token server output cap.
No paid cloud calls or fallback occurred. This server is a test prerequisite,
not a shipped inference service or LiteLLM gateway.

The independent runtime review of `ca98028` found no blockers. The first
installer review found three concrete issues: offline Pi acquisition ignored
the installer flag, XDG release locations could conflict with stable state
validation, and verified cached Bun could lack executable permissions. Fixes
honor the offline environment flag, keep private state beneath home even for
external release storage, and repair verified Bun permissions. Regressions cover
all three. Fresh review and hosted clean-install results are recorded at handoff.

Local integrated check at the runtime checkpoint: **183 tests passed**, no
failures; TypeScript and publication integrity passed with the immutable original
concept and all nine Relay source pins preserved. Actual native Herdr PTY tests
exercise input, resize, Ctrl-C→130 and cleanup using Bun's own terminal API;
they are enabled in CI by `LAB_HERDR_ACTUAL=1`, without an extra Python dependency.
The runtime installer verifies source integrity and owned terminal startup;
developer regressions/typecheck run separately in CI, since the installed source
archive has no Git checkout. Candidate HEAD probing remains a required bounded
Git operation for developer task demos.

Historical GIF/PNG captures still describe source commit
`93a831c4dbfe774f3c4a025f7c70334ae0f3e6b4`. Their audit verifies the original
source bytes with Git history and retains every decode, privacy and behavioral
assertion. The images and source hashes have not been relabelled as current.

Ubuntu CI, macOS CI, the development mini, the user's different MacBook and WSL
are distinct targets. Local evidence qualifies the mini only. Controlled LAB
request admission remains unqualified; no workspace observation accepts a task.
