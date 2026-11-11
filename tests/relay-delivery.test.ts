import { expect, test } from "bun:test";
import { relayDelivery } from "../src/pi/relay-delivery.ts";
import type { WorkspaceContext, WorkspaceExtensionAPI } from "../src/pi/workspace-extension.ts";

test("idle delivery starts one turn, preserves IDs for replies, and survives reload without redelivery", async () => {
  let idle = false, current = true, reads = 0;
  const transcript: any[] = [], options: unknown[] = [];
  const ctx = { isIdle: () => idle, sessionManager: { getBranch: () => transcript } } as unknown as WorkspaceContext;
  const pi = { sendMessage(message: unknown, opts: unknown) { transcript.push({ type: "custom_message", ...(message as object) }); options.push(opts); } } as WorkspaceExtensionAPI;
  const inbox = async () => { reads++; return { messages: [{ id: "m1", from: "peer-a", body: "Review file A", conversationId: "c1" }], unread: 1 }; };
  const deliver = relayDelivery(pi, ctx, inbox, () => current);
  await deliver(); expect(reads).toBe(0);
  idle = true; await deliver(); await deliver();
  expect(transcript).toHaveLength(1);
  expect(transcript[0]!.content).toContain('"id":"m1"');
  expect(options).toEqual([{ triggerTurn: true, deliverAs: "followUp" }]);
  await relayDelivery(pi, ctx, inbox, () => current)();
  expect(transcript).toHaveLength(1);
  current = false; await deliver(); expect(reads).toBe(3);
});

test("a stream or session switch during an inbox read postpones delivery; overlapping checks do not duplicate reads", async () => {
  let idle = true, current = true, reads = 0, sends = 0;
  let resolve!: (result: unknown) => void;
  const pi = { sendMessage() { sends++; } } as unknown as WorkspaceExtensionAPI;
  const ctx = { isIdle: () => idle } as WorkspaceContext;
  const deliver = relayDelivery(pi, ctx, () => { reads++; return new Promise(r => { resolve = r; }); }, () => current);
  const first = deliver(); await deliver(); expect(reads).toBe(1);
  idle = false; resolve({ messages: [{ id: "m1", body: "hello" }], unread: 1 }); await first; expect(sends).toBe(0);
  idle = true; const second = deliver(); current = false;
  resolve({ messages: [{ id: "m1", body: "hello" }], unread: 1 }); await second; expect(sends).toBe(0);
});
