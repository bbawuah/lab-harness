import { expect, test } from "bun:test";
import { relayPeerLabel, renderRelayView, safeRelayText, type RelayView } from "../src/pi/relay-presentation.ts";

const peers = [
  { id: "peer-123abc", name: "project/session-one", presence: "online", self: true },
  { id: "peer-456abc", name: "project/session-two", presence: "offline" },
];
const text = (view: RelayView, expanded = false) => renderRelayView(view, 200, { expanded }).join("\n");

test("labels use project names and extend colliding suffixes", () => {
  expect(relayPeerLabel(peers[0]!.id, peers)).toBe("project 123abc");
  expect(relayPeerLabel("unknown-deadbe", peers)).toBe("Peer deadbe");
  expect(relayPeerLabel("project/session-one", peers)).toBe(relayPeerLabel(peers[0]!.id, peers));
  expect(relayPeerLabel("x/a", [{ id: "one-123abc", name: "x/a" }, { id: "two-123abc", name: "x/b" }])).toBe("x e-123abc");
  expect(relayPeerLabel("one-123abc", [{ id: "one-123abc", name: "x/a" }, { id: "two-123abc", name: "x/b" }])).toBe("x e-123abc");
  expect(relayPeerLabel("abcd", [{ id: "abcd", name: "p\n\x1b\u202e/q" }])).toBe("p\\n\\x1b\\u{202e} abcd");
});

test("send distinguishes pending, stored, duplicate and unknown, and hides metadata", () => {
  const request = { to: peers[0]!.id, requestKey: "secret-key", body: "hello", conversationId: "conversation-secret" };
  const result = { state: "stored", id: "message-secret", receipt: "receipt-secret", duplicate: true };
  const view: RelayView = { action: "send", request, result, peers };
  const before = JSON.stringify(view);
  const collapsed = text(view);
  expect(collapsed).toContain("Sent to project 123abc (stored)");
  expect(collapsed).toContain("[Details: expand with Ctrl+O (or /hotkeys)]");
  expect(text({ ...view, request: { ...request, to: peers[0]!.name } })).toContain("Sent to project 123abc (stored)");
  expect(collapsed).toContain("Already stored; no duplicate created");
  for (const secret of ["secret-key", "conversation-secret", "message-secret", "receipt-secret", "peer-123abc"]) expect(collapsed).not.toContain(secret);
  const expanded = text(view, true);
  for (const original of ["secret-key", "conversation-secret", "message-secret", "receipt-secret", "peer-123abc"]) expect(expanded).toContain(original);
  expect(JSON.stringify(view)).toBe(before);
  expect(text({ ...view, pending: true })).toContain("Send to project 123abc");
  expect(text({ ...view, pending: true })).not.toContain("stored");
  expect(text({ ...view, result: {} })).toContain("may have stored");
  const error = text({ ...view, error: "\x1b[31mprivate" });
  expect(error).toContain("Send failed"); expect(error).toContain("reuse the request key and payload"); expect(error).not.toContain("private");
});

test("inbox, peer pages and ack reflect only confirmed results", () => {
  const inbox = text({ action: "inbox", peers, result: { messages: [{ from: peers[1]!.id, body: "first\nsecond", id: "hidden-id" }] } });
  expect(inbox).toContain("Received from project 456abc\nfirst\nsecond");
  expect(inbox).toContain("Fetched; not acknowledged"); expect(inbox).not.toContain("hidden-id");
  expect(text({ action: "inbox", result: { messages: [], timedOut: true } })).toContain("no messages fetched before the wait ended");
  expect(text({ action: "inbox", result: { messages: [] } })).toContain("Inbox empty");
  const page = text({ action: "peers", result: { peers, total: 4, nextOffset: 2 } });
  expect(page).toContain("project 123abc (self) - online"); expect(page).toContain("2 shown; 4 total; more pages available");
  expect(text({ action: "peers", result: { peers: [], total: 0 } })).toContain("No peers on this page");
  expect(text({ action: "ack", result: { acknowledged: 2, ignored: 1 } })).toContain("Acknowledged 2 message(s); ignored 1");
  expect(text({ action: "ack", error: "RELAY_CONFLICT" })).toContain("Ack failed\nRELAY_CONFLICT");
  expect(text({ action: "ack", result: {} })).toContain("Ack outcome unknown");
});

test("escapes terminal controls and bounds previews and expanded data", () => {
  expect(safeRelayText("a\n\x1b\x00\x7f\u009b\u202e\u200b")).toBe("a\n\\x1b\\x00\\x7f\\x9b\\u{202e}\\u{200b}");
  const v: RelayView = { action: "inbox", result: { messages: [{ from: "a", body: "line\n".repeat(20000) + "end\x1b" }] } };
  const collapsed = text(v);
  expect(collapsed).toContain("line\nline\nline\n[Details: expand");
  expect(collapsed).not.toContain("end");
  expect(text(v, true)).toContain("Details truncated");
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  expect(text({ action: "ack", request: cyclic, result: { acknowledged: 0 } }, true)).toContain("[circular]");
  expect(text({ action: "ack", request: cyclic, result: { acknowledged: 0 } }, true)).toContain("Details truncated");
});

test("narrow, Unicode and ASCII output is plain, bounded by display cells and never throws", () => {
  const view: RelayView = { action: "send", peers, request: { to: peers[0]!.id, body: "界e\u0301😀👩‍💻\n\x1b[31m" }, result: { state: "stored" } };
  for (const width of [0, 1, 20, 40]) for (const ascii of [false, true]) for (const expanded of [false, true]) {
    const lines = renderRelayView(view, width, { ascii, expanded });
    if (width === 0) expect(lines).toEqual([]);
    for (const line of lines) {
      expect(Bun.stringWidth(line)).toBeLessThanOrEqual(width);
      expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u);
    }
  }
  expect(text(view)).toContain("界e\u0301😀");
  expect(renderRelayView(view, 100, { ascii: true }).join("\n")).toContain("Relay - Sent");
  expect(() => renderRelayView({ action: "inbox", result: { messages: [null, 1, {}] } }, 20, { expanded: true })).not.toThrow();
});


test("completed results expose details and known errors remain safe", () => {
  const views: RelayView[] = [
    { action: "peers", result: { peers: [], total: 0 } },
    { action: "send", result: { state: "stored" } },
    { action: "inbox", result: { messages: [] } },
    { action: "ack", result: { acknowledged: 0 } },
    { action: "ack", error: "RELAY_CONFLICT" },
  ];
  for (const view of views) {
    expect(text(view)).toContain("[Details: expand with Ctrl+O (or /hotkeys)]");
    expect(text(view, true)).not.toContain("[Details: expand with Ctrl+O");
  }
  expect(text({ action: "ack", pending: true })).not.toContain("[Details:");
  for (const code of ["RELAY_INVALID", "RELAY_UNKNOWN_PEER", "RELAY_TOO_LARGE", "RELAY_BACKPRESSURE", "RELAY_UNSUPPORTED", "RELAY_CANCELLED"])
    expect(text({ action: "send", error: code })).toContain(code);
  for (const usage of ["Use /relay-send PEER REQUEST_KEY MESSAGE", "Use /relay-ack MESSAGE_ID [MESSAGE_ID ...]", "Use /relay-peers [OFFSET]", "Use /relay-inbox [WAIT_MS]"])
    expect(text({ action: "ack", error: usage })).toContain(usage);
  const cancelled = text({ action: "send", error: "RELAY_CANCELLED" });
  expect(cancelled).toContain("Send cancelled");
  expect(cancelled).toContain("may have stored");
  expect(cancelled).toContain("reuse the request key and payload");
  expect(cancelled).not.toContain("Send failed");
  expect(text({ action: "ack", error: "Use /relay-evil \x1bSECRET" })).not.toContain("SECRET");
});


test("expanded identifiers remain available before long bodies and bounded JSON", () => {
  const messages = Array.from({ length: 5 }, (_, i) => ({
    id: `message-${i}-` + "i".repeat(118), from: `sender-${i}-` + "s".repeat(119), body: "z".repeat(4000),
  }));
  const view: RelayView = { action: "inbox", result: { messages } };
  const before = JSON.stringify(view);
  for (const width of [80, 20]) {
    const expanded = renderRelayView(view, width, { expanded: true }).join("\n");
    const projection = expanded.split("Details (request and result):".slice(0, width))[0]!.replaceAll("\n", "");
    for (const message of messages) {
      expect(projection).toContain(message.id);
      expect(projection).toContain(message.from);
    }
    expect(expanded.replaceAll("\n", "")).toContain("Details truncated; full data remains in the original payload");
    const collapsed = renderRelayView(view, width).join("\n").replaceAll("\n", "");
    for (const message of messages) expect(collapsed).not.toContain(message.id);
  }
  expect(JSON.stringify(view)).toBe(before);
  const send: RelayView = { action: "send", request: { to: "recipient-" + "r".repeat(118), requestKey: "key-" + "k".repeat(124), body: "z".repeat(4000) }, result: { state: "stored", id: "receipt-" + "x".repeat(120) } };
  const expanded = renderRelayView(send, 20, { expanded: true }).join("").replaceAll("\n", "");
  expect(expanded).toContain((send.request as { to: string }).to);
  expect(expanded).toContain((send.request as { requestKey: string }).requestKey);
  expect(expanded).toContain((send.result as { id: string }).id);
  expect(expanded).toContain("Details truncated; full data remains in the original payload");
});

test("expanded identifier projection bounds malformed data and resolves recipient aliases", () => {
  const view: RelayView = { action: "send", peers, request: { to: peers[0]!.name, requestKey: "k".repeat(500) }, result: { id: "x".repeat(500) } };
  const expanded = text(view, true);
  expect(expanded).toContain("Recipient ID: peer-123abc");
  expect(expanded).toContain("[Identifier truncated]");
  expect(expanded.split("Details (request and result):")[0]).not.toContain("k".repeat(500));
  const many = text({ action: "inbox", result: { messages: Array.from({ length: 11 }, (_, i) => ({ id: `id-${i}`, from: `from-${i}`, body: "" })) } }, true);
  const projection = many.split("Details (request and result):")[0]!;
  for (let i = 0; i < 10; i++) { expect(projection).toContain(`Message ID: id-${i}`); expect(projection).toContain(`Sender ID: from-${i}`); }
  expect(projection).toContain("[Further message identifiers omitted]");
});
