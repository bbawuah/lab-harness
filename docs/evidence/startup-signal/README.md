# Startup signal test evidence

This is a test-only repair from `5a4edc2797d005643a1fc2f4c40404f4a2974b39`. The production adapter has two existing cleanup paths. A recorded PID requires `workerStopped: true`; an unrecorded PID requires authoritative status plus native pane absence and retains the honest `unknown` PID-cleanup field. The test now checks each exact path and independently verifies the owned worker is gone.

The controlled wrapper uses a byte-for-byte copy of the production protocol implementation. It forwards the real response objects and errors. Named FIFO handshakes delay the owned worker or the return of a real native response; no PID, pane, signal result or cleanup response is invented. The known-PID path acknowledges actual signal delivery before resuming. All original natural-order TERM/HUP cases, malformed status refusal, bootstrap replacement and cleanup checks remain. The original 10-second startup, 20-second process and 25-second case bounds are unchanged.

`old-assumption.txt` is an intentional failure using the same actual known-PID fixture with the old assertion appended after the corrected cleanup assertions. `focused.txt` records the passing complete focused file. `report.json` contains exact source and raw-evidence hashes, all 13 signal cases and limits. `report.html` and `report.png` are an editorial rendering of those observations, **not native terminal UI pixels**.

The original private CI log is preserved unchanged. Its later cleanup assertions were not reached; its exact scheduling cannot be recovered from that log alone. The controlled reproduction demonstrates the same assertion fails for a valid recorded-PID ordering. Preliminary fixture failures and the final signal-delivery handshake are disclosed in the report. No production bug is claimed fixed. No model or service was used. Ubuntu remains a CI condition. PR17's unresolved reload HOLD and PR18's frozen stack are not changed.

Reproduce with the existing verified runtime:

```sh
LAB_HERDR_ACTUAL=1 bun --no-env-file --no-install test tests/herdr-shell.test.ts
bun --no-env-file run typecheck
bun --no-env-file run check:publication
```
