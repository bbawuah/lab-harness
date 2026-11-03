# Evidence: sanitized terminal captures (2026-11-03)

Plain text from `tmux capture-pane` during the [JOURNEY.md](../JOURNEY.md) walkthrough. File numbers match the
journey steps. Files 30–36 come from the second walk (Relay between two sessions, steps R1–R9 in the
Tool flows section). They use only slash commands, with the route pointed at a closed loopback port.

Sanitizing:

- The scratch home path is replaced by `$SCRATCH_HOME`.
- User and host names are replaced, including fragments wrapped across pane columns.
- The API key was blank throughout, and no tokens or secrets were present.

Box-drawing characters are Herdr and Pi frames. Long lines wrap where the terminal wrapped them.

## Fixture files

These are fixtures, not product code. They are stored as `.txt` so they are never executed or published as
source.

- `fixture-server.ts.txt` is the scripted OpenAI-compatible fixture (127.0.0.1 only, no model). Every reply is
  marked `[SCRIPTED FIXTURE]`.
- `fixture-requests.jsonl.txt` contains the request shapes LAB/Pi sent to the fixture: tool names and schemas, roles,
  `max_tokens`, and prompt sizes. It contains no prompt text and no key.
- `fixture-page.html.txt` is the local page used for `lab --browser`.
