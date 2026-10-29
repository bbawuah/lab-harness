import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pinned from "../contracts/pi-runtime.json";

const project = resolve(import.meta.dir, "..");
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

// Run the real exported API in an isolated project with a tiny explicitly labelled
// fixture archive. No real Pi, inference, global fetch mocking or public network.
function fixture(versionOutput = "1.4.0") {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "lab-pi-acquire-"));
  const local = join(root, "project with spaces"), payload = join(root, "payload"), bundle = join(payload, "pi");
  for (const path of [local, join(local, "src"), join(local, "src/runtime"), join(local, "contracts"), join(local, "scripts"), join(local, "scripts/pi"), payload, bundle, join(bundle, "assets")]) mkdirSync(path);
  const binary = `#!/bin/sh\n[ "$1" = --version ] || exit 43\nprintf probe > "$HOME/pi-fixture-probe"\nprintf '%s\\n' '${versionOutput}'\n`;
  writeFileSync(join(bundle, "pi"), binary, { mode: 0o700 });
  writeFileSync(join(bundle, "assets/theme.json"), '{"fixture":true}\n');
  const archive = join(root, "fixture.tar.gz");
  const tar = Bun.spawnSync(["tar", "-czf", archive, "-C", payload, "pi"]);
  if (tar.exitCode !== 0) throw new Error(tar.stderr.toString());
  const bytes = readFileSync(archive), theme = readFileSync(join(bundle, "assets/theme.json"));
  const tree = `D assets\nF assets/theme.json ${theme.length} ${sha(theme)}\nF pi ${Buffer.byteLength(binary)} ${sha(binary)}\n`;
  let requests = 0, response: () => Response | Promise<Response> = () => new Response(bytes);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { requests++; return response(); } });
  const contract = { ...pinned, artifacts: [{
    platform: process.platform, arch: process.arch, name: "test-fixture.tar.gz", url: `http://127.0.0.1:${server.port}/fixture.tar.gz`,
    archiveBytes: bytes.length, archiveSHA256: sha(bytes), binarySHA256: sha(binary), treeSHA256: sha(tree),
    fileCount: 2, entryCount: 3, unpackedBytes: theme.length + Buffer.byteLength(binary),
  }] };
  writeFileSync(join(local, "contracts/pi-runtime.json"), JSON.stringify(contract));
  copyFileSync(join(project, "src/runtime/pi.ts"), join(local, "src/runtime/pi.ts"));
  copyFileSync(join(project, "scripts/pi/acquire.ts"), join(local, "scripts/pi/acquire.ts"));
  writeFileSync(join(local, "driver.ts"), `
import { acquirePiRuntime, verifyPiRuntime } from "./src/runtime/pi.ts";
try {
  const action = process.argv[2];
  const result = action === "verify" ? verifyPiRuntime() : await acquirePiRuntime({ offline: action === "offline" });
  console.log(JSON.stringify(result));
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
`);
  const run = async (action = "acquire", cli = false, cliArgs: string[] = []) => {
    const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", cli ? join(local, "scripts/pi/acquire.ts") : join(local, "driver.ts"), ...(cli ? cliArgs : [action])], {
      cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root }, stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  };
  const cache = join(local, ".tmp/pi/1.4.0"), destination = join(cache, `${process.platform}-${process.arch}`), installed = join(destination, "pi");
  return { root, local, bytes, cache, destination, installed, run, requests: () => requests, disconnect: () => server.stop(true), respond: (fn: () => Response | Promise<Response>) => { response = fn; },
    clean: () => { server.stop(true); rmSync(root, { recursive: true, force: true }); } };
}

test("pins official standalone archives for macOS arm64/x64 and Linux x64 with separate source identities", () => {
  expect(pinned.artifacts.map(a => `${a.platform}/${a.arch}`).sort()).toEqual(["darwin/arm64", "darwin/x64", "linux/x64"]);
  expect(pinned.version).toBe("1.4.0");
  expect(pinned.sourcePinMatch).toBe(false);
  expect(pinned.releaseCommit).not.toBe(pinned.historicalSourcePin);
  expect(pinned.license.spdx).toBe("MIT");
  expect(sha(pinned.license.text)).toBe(pinned.license.sha256);
  for (const artifact of pinned.artifacts) {
    expect(artifact.url).toBe(`https://github.com/earendil-works/pi/releases/download/v1.4.0/${artifact.name}`);
    for (const hash of [artifact.archiveSHA256, artifact.binarySHA256, artifact.treeSHA256]) expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.fileCount).toBe(211);
  }
});

test("missing verification and offline acquisition are read-only and never download", async () => {
  const f = fixture();
  try {
    expect((await f.run("verify")).stderr).toContain("Project-local Pi runtime unavailable");
    expect((await f.run("offline")).stderr).toContain("Offline Pi acquisition requires");
    expect(f.requests()).toBe(0);
    expect(existsSync(join(f.local, ".tmp"))).toBe(false);
  } finally { f.clean(); }
});

test("acquires complete project-local bundle; cached, offline and verification runs make no writes/downloads", async () => {
  const f = fixture();
  try {
    const first = await f.run();
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual({ command: [join(f.installed, "pi")], version: "1.4.0" });
    expect(f.requests()).toBe(1);
    const before = lstatSync(join(f.installed, "pi"));
    f.respond(() => new Response("must not request", { status: 500 }));
    for (const action of ["verify", "acquire", "offline"]) expect((await f.run(action)).code).toBe(0);
    const after = lstatSync(join(f.installed, "pi"));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.ctimeMs).toBe(before.ctimeMs);
    expect(existsSync(join(f.root, "pi-fixture-probe"))).toBe(false);
    expect(f.requests()).toBe(1);
    expect(readdirSync(f.cache)).toEqual([`${process.platform}-${process.arch}`]);
  } finally { f.clean(); }
});

for (const damage of ["binary", "asset", "missing-asset", "extra-file", "not-executable", "symlink", "hardlink"] as const) {
  test(`verification refuses ${damage}; offline preserves it; acquisition repairs atomically`, async () => {
    const f = fixture();
    try {
      expect((await f.run()).code).toBe(0);
      const binary = join(f.installed, "pi"), asset = join(f.installed, "assets/theme.json");
      if (damage === "binary") writeFileSync(binary, "broken");
      if (damage === "asset") writeFileSync(asset, "broken");
      if (damage === "missing-asset") rmSync(asset);
      if (damage === "extra-file") writeFileSync(join(f.installed, "unexpected.ts"), "unexpected");
      if (damage === "not-executable") chmodSync(binary, 0o600);
      if (damage === "symlink") { rmSync(asset); symlinkSync(join(f.root, "external"), asset); }
      if (damage === "hardlink") linkSync(binary, join(f.root, "hardlink"));
      expect((await f.run("verify")).code).toBe(1);
      expect((await f.run("offline")).code).toBe(1);
      expect(f.requests()).toBe(1);
      expect((await f.run()).code).toBe(0);
      expect(f.requests()).toBe(2);
      expect((await f.run("verify")).code).toBe(0);
      expect(readdirSync(f.cache)).toEqual([`${process.platform}-${process.arch}`]);
    } finally { f.clean(); }
  });
}

for (const failure of ["http", "truncated", "oversized", "hash"] as const) {
  test(`failed ${failure} download leaves previous cache untouched and removes owned staging/lock`, async () => {
    const f = fixture();
    try {
      expect((await f.run()).code).toBe(0);
      const asset = join(f.installed, "assets/theme.json"); writeFileSync(asset, "needs repair");
      f.respond(() => {
        if (failure === "http") return new Response("fixture failure", { status: 503 });
        if (failure === "truncated") return new Response(f.bytes.subarray(0, 20));
        if (failure === "oversized") return new Response(Buffer.concat([f.bytes, Buffer.from("extra")]));
        const bytes = Buffer.from(f.bytes); bytes[0] ^= 255; return new Response(bytes);
      });
      expect((await f.run()).code).toBe(1);
      expect(readFileSync(asset, "utf8")).toBe("needs repair");
      expect(readdirSync(f.cache)).toEqual([`${process.platform}-${process.arch}`]);
      expect((await f.run("offline")).code).toBe(1);
      f.respond(() => new Response(f.bytes));
      expect((await f.run()).code).toBe(0);
    } finally { f.clean(); }
  });
}

test("unreachable download preserves damaged cache and removes owned staging/lock", async () => {
  const f = fixture();
  try {
    expect((await f.run()).code).toBe(0);
    const asset = join(f.installed, "assets/theme.json"); writeFileSync(asset, "needs repair");
    f.disconnect();
    expect((await f.run()).code).toBe(1);
    expect(readFileSync(asset, "utf8")).toBe("needs repair");
    expect(readdirSync(f.cache)).toEqual([`${process.platform}-${process.arch}`]);
  } finally { f.clean(); }
});

test("concurrent acquisition refuses the second writer and keeps the first installation intact", async () => {
  const f = fixture();
  let release!: (response: Response) => void;
  try {
    f.respond(() => new Promise<Response>(resolve => { release = resolve; }));
    const first = f.run();
    const until = Date.now() + 3000;
    while (!f.requests() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    expect(f.requests()).toBe(1);
    const second = await f.run(); expect(second.code).toBe(1); expect(second.stderr).toContain("acquisition is locked");
    release(new Response(f.bytes));
    expect((await first).code).toBe(0);
    expect((await f.run("verify")).code).toBe(0);
    expect(f.requests()).toBe(1);
  } finally { release?.(new Response(f.bytes)); f.clean(); }
});

test("extraction failure publishes nothing and releases its lock", async () => {
  const f = fixture();
  try {
    const bytes = Buffer.from("not a tar archive");
    const path = join(f.local, "contracts/pi-runtime.json"), contract = JSON.parse(readFileSync(path, "utf8"));
    contract.artifacts[0].archiveSHA256 = sha(bytes); contract.artifacts[0].archiveBytes = bytes.length;
    writeFileSync(path, JSON.stringify(contract)); f.respond(() => new Response(bytes));
    const result = await f.run(); expect(result.code).toBe(1); expect(result.stderr).toContain("archive extraction failed");
    expect(existsSync(f.destination)).toBe(false); expect(readdirSync(f.cache)).toEqual([]);
  } finally { f.clean(); }
});

test("partial installations and abandoned staging are never used as runtime", async () => {
  const f = fixture();
  try {
    mkdirSync(f.installed, { recursive: true }); writeFileSync(join(f.installed, "pi"), "partial");
    const abandoned = join(f.cache, ".stage-unrelated-interruption"); mkdirSync(abandoned);
    writeFileSync(join(abandoned, "keep"), "unowned");
    expect((await f.run("verify")).code).toBe(1);
    expect((await f.run()).code).toBe(0);
    expect(readFileSync(join(abandoned, "keep"), "utf8")).toBe("unowned");
    expect((await f.run("verify")).code).toBe(0);
  } finally { f.clean(); }
});

test("cache directory symlinks refuse both verification and acquisition without following them", async () => {
  for (const point of [".tmp", ".tmp/pi", ".tmp/pi/1.4.0", `.tmp/pi/1.4.0/${process.platform}-${process.arch}`]) {
    const f = fixture();
    try {
      const outside = join(f.root, "outside"); mkdirSync(outside);
      const at = join(f.local, point), parent = resolve(at, ".."); mkdirSync(parent, { recursive: true }); symlinkSync(outside, at);
      expect((await f.run("verify")).code).toBe(1);
      expect((await f.run()).code).toBe(1);
      expect(f.requests()).toBe(0);
      expect(readdirSync(outside)).toEqual([]);
    } finally { f.clean(); }
  }
});

test("exclusive acquisition lock gives an actionable error without deleting another installer's lock", async () => {
  const f = fixture();
  try {
    mkdirSync(f.cache, { recursive: true });
    const lock = join(f.cache, `.${process.platform}-${process.arch}.acquire.lock`); mkdirSync(lock);
    const result = await f.run(); expect(result.code).toBe(1); expect(result.stderr).toContain("ensure no acquisition is running");
    expect(existsSync(lock)).toBe(true); expect(f.requests()).toBe(0);
    rmSync(lock, { recursive: true }); expect((await f.run()).code).toBe(0);
  } finally { f.clean(); }
});

test("wrong version fails staging verification and publishes nothing", async () => {
  const f = fixture("1.4.1");
  try {
    const result = await f.run(); expect(result.code).toBe(1); expect(result.stderr).toContain("version probe failed");
    expect(existsSync(f.destination)).toBe(false); expect(readdirSync(f.cache)).toEqual([]);
  } finally { f.clean(); }
});

test("acquisition CLI supports --offline, reports exact runtime JSON and rejects unknown flags", async () => {
  const f = fixture();
  try {
    expect((await f.run("", true, ["--offline"])).code).toBe(1);
    expect((await f.run("", true, ["--unknown"])).code).toBe(2);
    expect((await f.run("", true, ["--offline", "--offline"])).code).toBe(2);
    expect(f.requests()).toBe(0);
    expect((await f.run("", true)).code).toBe(0);
    const cached = await f.run("", true, ["--offline"]);
    expect(cached.code).toBe(0); expect(JSON.parse(cached.stdout).version).toBe("1.4.0");
    expect(f.requests()).toBe(1);
  } finally { f.clean(); }
});
