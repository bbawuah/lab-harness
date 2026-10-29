import { afterEach, expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { request } from "../src/herdr/protocol.ts";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
async function fixture(reply: (socket: Socket, message: any) => void) {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/p-"));
  const path = join(root, "s.sock");
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    let buffer = "";
    socket.on("data", chunk => { buffer += chunk; if (buffer.includes("\n")) reply(socket, JSON.parse(buffer.split("\n")[0]!)); });
  });
  await new Promise<void>(resolve => server.listen(path, resolve));
  cleanups.push(() => { for (const socket of sockets) socket.destroy(); server.close(); rmSync(root, { recursive: true, force: true }); });
  return path;
}
test("fixture protocol: fragmented NDJSON preserves Unicode and correlates id", async () => {
  const path = await fixture((socket, msg) => {
    expect(msg.method).toBe("pane.read"); expect(msg.params.pane_id).toBe("w1:p2");
    socket.write(JSON.stringify({ id: msg.id, result: { text: "✓ worker" } }).slice(0, 8));
    socket.end(JSON.stringify({ id: msg.id, result: { text: "✓ worker" } }).slice(8) + "\n");
  });
  expect((await request(path, "pane.read", { pane_id: "w1:p2" })).text).toBe("✓ worker");
});
test("fixture protocol: mismatched id and API errors fail", async () => {
  const wrong = await fixture(socket => socket.end('{"id":"other","result":{}}\n'));
  await expect(request(wrong, "ping")).rejects.toThrow("id mismatch");
  const failed = await fixture((socket, msg) => socket.end(JSON.stringify({ id: msg.id, error: { code: "not_found" } }) + "\n"));
  await expect(request(failed, "pane.get")).rejects.toThrow("not_found");
});
test("fixture protocol: timeout is outcome unknown; mutations are never retried", async () => {
  let deliveries = 0;
  const path = await fixture(() => { deliveries++; });
  await expect(request(path, "layout.apply", {}, 30)).rejects.toThrow("outcome unknown");
  expect(deliveries).toBe(1);
});
test("fixture protocol: malformed, incomplete and oversized responses fail", async () => {
  for (const [data, error] of [["{bad}\n", "JSON"], ['{"id":', "complete response"], ["x".repeat(1024 * 1024 + 1), "exceeds 1 MiB"]]) {
    const path = await fixture(socket => socket.end(data!));
    await expect(request(path, "ping")).rejects.toThrow(error);
  }
});
