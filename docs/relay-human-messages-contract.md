# Relay human messages: frozen presentation contract

Base: merged main `5a4edc2797d005643a1fc2f4c40404f4a2974b39`. This slice changes presentation only. The message-only Relay closure, bus/session ownership, request keys, receipts, retry horizon, read/ack behavior, heartbeat, cancellation, ledger and controlled-task boundary remain unchanged.

## Source and native mechanism

Inspected 2026-10-30. Claude Code's [agent teams documentation](https://code.claude.com/docs/en/agent-teams#context-and-communication) describes named teammates and direct messages. This informs readable attribution; LAB does not import its roles, automatic delivery, task authority or subscription behavior.

Pi is the exact official 1.4.0 release, source `4a080252f06caf63a525d7873c5d94d3c23887e0`. Its [extension guide](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/extensions.md#tool-rendering) and [types](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/types.ts) support `renderCall(args, theme, context)`, `renderResult(result, {expanded,isPartial}, theme, context)`, and `registerMessageRenderer(type, renderer)`. Renderers return a native Component (`render(width)`, `invalidate()`). No replacement transcript renderer or protocol engine is needed.

Pinned `CustomMessageComponent.setExpanded` and `ToolExecutionComponent.setExpanded` propagate the native expanded state. Pi's `app.tools.expand` defaults to Ctrl+O; the guide delegates remapped bindings to `/hotkeys`. Native tool result click expansion is upstream-owned; no physical-mouse qualification is added. Slash custom messages must also be verified with actual Ctrl+O before claiming expansion.

## Visible behavior

- Startup: `Relay ready · <readable session label>`. No full ID by default.
- Send call: `Relay · Send to <label>` with a bounded preview. A call does not claim storage. Successful receipt: `Relay · Sent to <label> (stored)` and message; retry receipt: `Already stored; no duplicate created`. Never say delivered, read, handled or completed from a send receipt.
- Inbox: one `Relay · Received from <label>` row per actually fetched message, followed by its text. Footer says `Fetched; not acknowledged`. No push/notification/wakeup claim. Empty: `Relay · Inbox empty`; a completed wait may say no messages were fetched before the wait ended.
- Peers: readable labels, self marker, observed presence and pagination count. Presence is not a completion or reachability guarantee.
- Ack: only the backend's confirmed count, `Acknowledged N message(s)`, with ignored count if present. This is mailbox acknowledgement, not task acceptance/completion. Foreign ack refusal stays a failure.
- Failure: action-specific `Relay · <action> failed`, safe known code and recovery text. An unknown send outcome warns that it may have stored and that an exact retry must reuse the request key and payload. No automatic retry is added.
- Details: native expansion exposes sanitized original request/result JSON, full peer/message/conversation IDs and receipts. The collapsed view hides these fields. Original model-tool `content` and `details` remain byte-equivalent to the previous successful result, and original exceptions still propagate.

## Labels, safety and bounds

Labels are presentation aliases, not task roles or new transport addresses. Use the existing project part of a peer name plus a short stable peer-ID suffix. Unknown peers use `Peer <suffix>`. Resolve collisions in the available catalog/view by extending the suffix; full identities stay in details. Do not infer `Docs`/`Installer` roles or rename peers in the durable directory. Rendering and cache updates make no network requests. New peers outside the available page remain discoverable through normal pagination.

All untrusted names, message text, errors and expanded JSON are terminal-escaped: ESC, C0/C1, DEL, bidi/format controls and dangerous invisible controls become visible escapes; ordinary newlines and text remain readable. Do not parse incoming Markdown or terminal escape instructions. The model still receives the original data. Bound collapsed body previews to three wrapped lines, with an explicit native-expand hint for remaining text. Expanded presentation remains bounded and explicitly marks truncation; original complete data is retained in the model payload/session details. No renderer may fall back to unsanitized JSON on malformed historical data.

At narrow widths, wrap by display cells without splitting graphemes or overflowing the native width. Unicode text is preserved; ASCII mode uses ASCII separators/hints. Theme colors, if used, are native semantic colors and optional. `NO_COLOR` and dumb terminals receive plain labelled text. Meaning never depends on color. Shell theme, font settings and the known delayed-SGR fullscreen diagnostic remain untouched.

## Frozen module and file ownership

The coordinator alone edits `src/pi/relay-extension.ts`, `src/pi/workspace-extension.ts`, help/README/guide, integration/actual tests, publication/bootstrap and evidence. A helper may own only new `src/pi/relay-presentation.ts` and `tests/relay-presentation.test.ts`.

The pure module exports:

```ts
type RelayPeer = { id: string; name?: string; presence?: string; self?: boolean };
type RelayView = {
  action: "peers" | "send" | "inbox" | "ack";
  request?: unknown;
  result?: unknown;
  error?: string;
  peers?: readonly RelayPeer[];
  pending?: boolean;
};
relayPeerLabel(id: string, peers?: readonly RelayPeer[]): string;
safeRelayText(value: string): string;
renderRelayView(view: RelayView, width: number,
  options?: { expanded?: boolean; ascii?: boolean }): string[];
```

No filesystem, process, bridge, model, bus mutation or registration belongs in this module. It must tolerate malformed legacy data without exposing raw controls. Shared extension integration registers both tool and custom-message renderers, passes native expansion, keeps `triggerTurn:false`, and maintains only bounded presentation lookup state. No extra bus queries are allowed for rendering.

## Acceptance and release

Focused fixtures assert collapsed metadata exclusion, expanded original details, label collision behavior, Unicode/ASCII/narrow/NO_COLOR plain rendering, escaping, long multiline bounds, empty/paged peers/inbox, repeat receipts, unknown outcomes and ack semantics. Integration tests compare exact original tool JSON/content/details and bridge requests, including errors and nontriggering slash results during streaming.

Actual pinned Pi acceptance uses two owned sessions in a disposable project. Repeat the prior operator-driven greeting/README/install exchange, inspect native expansion/collapse and error/empty views, record cleanup and zero provider requests. Use an owned provider fixture for real model-tool protocol only if needed; label it fixture-driven. No cloud calls, model download, service changes, user mailbox or credential access.

Before/after assets preserve the real native text and IDs in expanded details; captions distinguish terminal-text replay from pixel capture and operator commands from inference. A fresh independent review, source freeze, explicit publication refresh, immutable completed-runtime archive/hash repin, hosted acceptance and exact-head required CI precede root readiness/merge.
