import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";

/** One bounded NDJSON request on a caller-owned socket. No discovery/retry of mutations. */
export function request(socketPath: string, method: string, params: Record<string, unknown> = {}, timeoutMs = 1000): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const socket = createConnection(socketPath);
    let bytes = 0;
    let buffer = "";
    let done = false;
    const finish = (error?: Error, result?: Record<string, any>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error(`${method}: timeout; delivery/outcome unknown`)), Math.max(1, timeoutMs));
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(JSON.stringify({ id, method, params }) + "\n"));
    socket.on("data", chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1024 * 1024) return finish(new Error(`${method}: response exceeds 1 MiB`));
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(buffer.slice(0, newline));
        if (response?.id !== id) throw new Error(`${method}: response id mismatch`);
        if (response.error) throw new Error(`${method}: ${JSON.stringify(response.error)}`);
        if (!response.result || typeof response.result !== "object" || Array.isArray(response.result)) throw new Error(`${method}: missing result`);
        finish(undefined, response.result);
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
    socket.on("error", error => finish(error));
    socket.on("end", () => finish(new Error(`${method}: connection closed before complete response; outcome unknown`)));
  });
}
