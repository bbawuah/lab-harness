import { createWriteStream, lstatSync, openSync, closeSync, writeSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { once } from "node:events";
import { files } from "./common.ts";

// USTAR has no host-specific pax headers, owner names or timestamps.
export async function pack(root: string, destination: string): Promise<void> {
  const gzip = createGzip({ level: 9 }), output = createWriteStream(destination, { mode: 0o600 });
  const finished = new Promise<void>((done, reject) => { output.on("finish", done); output.on("error", reject); gzip.on("error", reject); });
  gzip.pipe(output);
  const put = async (bytes: Buffer) => { if (!gzip.write(bytes)) await once(gzip, "drain"); };
  for (const path of files(root)) {
    const data = readFileSync(join(root, path)), header = Buffer.alloc(512);
    let name = path, prefix = "";
    if (Buffer.byteLength(name) > 100) { const split = path.lastIndexOf("/"); name = path.slice(split + 1); prefix = path.slice(0, split); }
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`USTAR path too long: ${path}`);
    header.write(name, 0, 100); header.write(prefix, 345, 155);
    const octal = (value: number, start: number, length: number) => header.write(value.toString(8).padStart(length - 1, "0") + "\0", start, length);
    octal(lstatSync(join(root, path)).mode & 0o111 ? 0o755 : 0o644, 100, 8);
    octal(0, 108, 8); octal(0, 116, 8); octal(data.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header.write("0", 156); header.write("ustar\0", 257); header.write("00", 263);
    const checksum = header.reduce((a, b) => a + b, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    await put(header); await put(data);
    if (data.length % 512) await put(Buffer.alloc(512 - data.length % 512));
  }
  await put(Buffer.alloc(1024)); gzip.end(); await finished;
  // Normalize gzip OS byte as well as the default zero mtime.
  const fd = openSync(destination, "r+"); try { writeSync(fd, Buffer.from([255]), 0, 1, 9); } finally { closeSync(fd); }
}
