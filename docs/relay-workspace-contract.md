# Built-in Relay workspace contract

Authorized runtime phase, frozen before implementation. This is message-only
Relay, not the legacy policy tree, Peerbus, roles or inbound hold. The nine-file
vendor closure at dfe1b039bab45f4055ab39467e994a2981940c02 is immutable. Existing
ledger RelayBus/receive/accept behavior is unchanged. Messaging never accepts a
task or supplies controlled native request admission.

## Ownership and supported surface

One isolated Codex high/default implementation specialist owns only new
src/relay/workspace.ts and tests/relay-workspace.test.ts. Coordinator owns this
contract, shared Pi workspace/extension/bridge/help, README/guide, installer,
bootstrap pin/publication and actual two-session acceptance. No grandchildren;
at most two active specialist/review tasks. All changes ordinary commits/pushes;
root owns PR watch/readiness/merge.

Use the actual bundled createMessageStore({path}), createMessageService and
createDirectory. No new MCP server/process/service configuration is needed.
Relay's exact schema forbids adding tables to its database; adapter control,
ownership and outbound intent journal belong in a separate private control DB.

## Frozen module API

~~~ts
type WorkspaceRelayRunOptions = {
  stateRoot: string; installRoot: string;
  projectBinding: ProjectBinding; runRoot: string;
  groupId?: string;
};
type RelayIdentity = {
  busId: string; namespace: string; peerId: string;
  name: string; generation: number;
};
type RelayRequest =
  | { action: "peers"; limit?: number; offset?: number }
  | { action: "send"; to: string; body: string; requestKey: string;
      conversationId?: string; replyTo?: string }
  | { action: "inbox"; limit?: number; waitMs?: number }
  | { action: "ack"; ids: string[] };

provisionWorkspaceRelayRun(options: WorkspaceRelayRunOptions): string;
// Returns absolute private run-reference file path, never a tool result.
bindWorkspaceRelaySession(runRef: string, sessionId: string): RelayIdentity;
openBoundWorkspaceRelay(runRef: string, sessionId: string,
  options?: { now?: () => number }): BoundWorkspaceRelay;

interface BoundWorkspaceRelay {
  readonly identity: RelayIdentity;
  peers(input?: {limit?: number; offset?: number}): {
    peers: {id: string; name: string; presence: string;
      lastSeenAt: number; self: boolean}[];
    total: number; nextOffset?: number;
  };
  send(input: Extract<RelayRequest, {action: "send"}>): Receipt;
  inbox(input?: {limit?: number; waitMs?: number},
    signal?: AbortSignal): Promise<{
      messages: Envelope[]; unread: number; timedOut: boolean;
    }>;
  ack(input: {ids: string[]}): {acknowledged: number; ignored: number};
  heartbeat(): void;
  release(): void;
  close(): void;
}
~~~

Export these types/functions. Receipt/Envelope are the vendor types. An optional
trusted clock argument may also be supplied to lifecycle functions for meaningful
expiry tests; it is never a model parameter. close only closes helper handles;
release is a separately fenced lifecycle action. Reopening a bound helper must
not register/rebind/release the peer. Coordinator dispatches fixed actions
through these methods; tool schemas never contain runRef/sessionId/namespace/
sender/statePath/generation/owner overrides. Reject unknown request fields.

## Project scope, private state and identity

Default database: stateRoot/relay/projects/PROJECT_KEY/messages.sqlite.
PROJECT_KEY is a versioned SHA-256 of verified canonical project root; release,
branch, HEAD and run do not change it. Persist root/device/inode and refuse
replacement; do not silently adopt an old project's mailbox. Reuse current
HOME-owned, nonsymlink/nonshared state guards, outside installation/project.
runRoot must be a real private child of stateRoot/runs.

Distinct worktrees/projects are separate by default. Optional groupId is an
operator-selected simple identifier, not a path. It selects a private
stateRoot/relay/groups/ID.json manifest with version:1 and explicit project
bindings. Both launchers must select the same group, whose namespace also binds
the manifest digest. Refuse unlisted/changed projects or changed manifest during
a session. No group is inferred, scanned or joined by model input. Cross-project
opt-in is optional; missing group config fails rather than broadening scope.

A native Pi session ID gets a unique durable peer in this scope. Use a stable
derived peer ID and a readable project/session prefix plus random suffix; expose
both ID and alias. Aliases must not shadow IDs. A new session gets a new peer;
reconnecting the same logical session preserves peer/inbox/sender retry journal.
Never import native history, context packs or skill bodies into Relay.

## Owner, lifecycle and crash recovery

provision creates a private unpredictable run capability/reference. Capabilities
and hashes never appear in tool/slash output, prompts, command args or logs.
This fences accidental/model-supplied identity changes, not malicious same-user
shell access or an OS sandbox.

Every send/read/ack/presence/release takes a control DB immediate transaction,
checks capability, active run/session owner, lease, project/group binding and
Relay endpoint generation, then performs its synchronous Relay operation while
still holding that control lock. Consistent lock order is control then Relay.
The vendor's registration/rebind/generation CAS alone does not authenticate owner.
Serialize registration so alias-versus-ID ambiguity cannot race.

Registration/rebind spans two DBs: first persist intent, then vendor register or
generation CAS, then mark active. Recover crashes by matching exact intended
endpoint/generation, never by alias alone. Persist provisioning/rebind intent
and test recovery boundaries. Same-session bind retry in one run is idempotent.
Another live capability cannot steal it. Released/expired ownership can be
reclaimed with new capability and exactly one generation advance.

Host heartbeat every 15 seconds, lease 60 seconds; no model calls. Discovery
derives stale/offline from lease, not persisted presence alone. Session start
binds before tools are usable; switch releases previous logical session before
binding next. Shutdown stops timers/waits, marks only current owner offline and
closes handles. Stale heartbeat/release cannot affect replacement. Crashes expire
leases but preserve durable mail/receipts. Native lifecycle hooks and session
identity must be verified against pinned Pi during coordinator integration.

## Message and tool semantics

Every tool-capable model receives relay_peers, relay_send, relay_inbox, relay_ack
through supported Pi registerTool. Operator equivalents: /relay-peers,
/relay-send, /relay-inbox, /relay-ack. Models without tool calling use slash
fallback; do not claim every model can execute tools.

Sender and inbox recipient always come from the trusted native session binding.
Only send.to selects a peer in the same scope. Persist exact resolved-recipient
outbound intent/fingerprint/requestKey before enqueue, then receipt. Identical
retry returns original message ID; changed payload conflicts, including after
helper restart. Refuse automatic retries beyond the conservative 30-day receipt
horizon; do not silently create a new key/message after expiry.

Read never acknowledges. Ack is explicit and recipient-bound. Validate all IDs
before mutating: foreign-recipient IDs are refused with no partial ack; unknown
or already-acknowledged own IDs can report ignored. Reply references must remain
between the same peers/conversation as vendor validation requires.

Bounds: body 16000 UTF-8 bytes; references <=128 characters; pending1000 per
recipient; inbox default5/max10; peers default20/max50 with offset; ack max100
IDs; wait default0/max10000ms polling250ms. Do not hold a DB transaction while
waiting; recheck owner/binding each poll. Abort stops wait/helper; a send may have
committed before cancellation, so its request key is the recovery handle.
Bridge input128KiB/output1MiB/deadline20s supports these bounds.

There is no wake dispatcher in this closure. Inbox polling happens only during
an explicit bounded request. Stored notification jobs are not delivered wakeups,
and messages never trigger continuous model calls. Model instructions suggest
checking inbox when coordinating/before handoff, not autonomous polling loops.
Unread bodies/pending jobs/peers can accumulate; no invented total-storage bound.

## Required acceptance

Module tests: same-project stable bus/new peers; group opt-in/default isolation;
unknown-field/identity/unsafe-path/stale-project refusal; concurrent owner/rebind
and stale send/read/ack/heartbeat/release; durable intent/response-loss/restart
deduplication; changed key payload conflict/expiry refusal; crash recovery at
provisioning/rebind boundaries; repeated read/nonautoack/foreign ack; reply and
queue/body/input/output/wait bounds/abort; unchanged ledger acceptance.

Coordinator actual acceptance: two owned Pi sessions with local model or provider
fixtures, automatic readable peer discovery, send/reply, repeated read until
explicit ack, foreign ack refusal, reconnect/restart without duplicate message,
normal shutdown/cleanup and private state outside release/project. No live user
messages, paid cloud calls, separate MCP setup or legacy policy code. Each PR
includes actual sanitized terminal/capture evidence with exact source/environment,
independent review, verified final runtime archive pin and exact-head CI.
