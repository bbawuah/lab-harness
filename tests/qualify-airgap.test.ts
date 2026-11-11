import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const script = resolve(import.meta.dir, "../scripts/qualify-airgap.sh");
const contracts = resolve(import.meta.dir, "../contracts");
const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const ROUTE_KEY = "0123456789abcdef0123456789abcdef"; // Azure-style 32 hex characters
const ROUTE_TOKEN = "eyJhbGciOiJSUzI1NiJ9.c2VjcmV0LXBheWxvYWQtdGhhdC1tdXN0LW5ldmVyLWxlYWs.c2ln";
const PROXY_PASSWORD = "Pr0xyPassw0rd";
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => { server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("unauthorized", { status: 401 }) }); });
afterAll(() => server.stop(true));

type Options = { wsl?: "2" | "1" | "none"; interop?: "enabled" | "disabled"; runtimes?: boolean; install?: boolean; edge?: boolean };
function fixture(options: Options = {}) {
  const { wsl = "2", interop = "enabled", runtimes = false, install = true, edge = true } = options;
  const root = mkdtempSync(join(realpathSync(tmpdir()), "lab-qualify-"));
  const home = join(root, "my home", "alice"), proc = join(root, "proc"), win = join(root, "mnt", "c"), out = join(root, "out");
  const file = (path: string, text: string, mode = 0o600) => { mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, text); chmodSync(path, mode); };
  mkdirSync(home, { recursive: true });
  file(join(proc, "sys/kernel/osrelease"), wsl === "2" ? "5.15.167.4-microsoft-standard-WSL2\n" : wsl === "1" ? "4.4.0-19041-Microsoft\n" : "6.8.0-45-generic\n");
  file(join(proc, "version"), wsl === "none" ? "Linux version 6.8.0-45-generic\n" : "Linux version 5.15 (Microsoft)\n");
  file(join(proc, "1/comm"), "systemd\n");
  if (wsl !== "none") file(join(proc, "sys/fs/binfmt_misc/WSLInterop"), `${interop}\ninterpreter /init\n`);
  file(join(root, "os-release"), 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu\n');
  if (edge) {
    file(join(win, "Program Files (x86)/Microsoft/Edge/Application/msedge.exe"), "MZ", 0o700);
    mkdirSync(join(win, "Program Files (x86)/Microsoft/Edge/Application/130.0.2849.80"), { recursive: true });
  }
  const data = join(home, ".local/share/lab-harness"), release = join(data, "releases", COMMIT), state = join(data, "workspace");
  if (install) {
    file(join(release, "lab"), "#!/bin/sh\nexit 0\n", 0o700);
    file(join(release, "install.sh"), "#!/bin/sh\nexit 0\n", 0o700);
    file(join(release, "package.json"), '{\n  "name": "lab-harness",\n  "version": "0.2.0"\n}\n');
    file(join(release, ".bun-version"), "1.4.2\n");
    mkdirSync(join(release, "contracts"), { recursive: true });
    if (runtimes) {
      // Fake runtimes whose hashes are pinned in fake contracts, plus a Bun double for the Bun-based probes.
      const bin = (path: string, body: string) => { file(path, body, 0o700); return sha(body); };
      const bun = bin(join(release, ".tmp/bun/1.4.2/bun"), '#!/bin/sh\ncode=\nwhile [ "$#" -gt 0 ]; do case "$1" in -e) code=$2; shift 2;; *) shift;; esac; done\ncase "$code" in *Bun.spawn*) printf "fail\\t0\\t-\\tfake\\n";; *verifyPiRuntime*) echo "ok 1.4.0";; *fetch*) echo "ok 401";; esac\n');
      const herdr = bin(join(release, ".tmp/herdr/herdr"), "#!/bin/sh\n# herdr\n");
      const rg = bin(join(release, ".tmp/rg/rg"), "#!/bin/sh\n# rg\n");
      const fd = bin(join(release, ".tmp/fd/fd"), "#!/bin/sh\n# fd\n");
      const pi = bin(join(release, ".tmp/pi/1.4.0/linux-x64/pi/pi"), "#!/bin/sh\n# pi\n");
      const json = (name: string, value: unknown) => file(join(release, "contracts", name), JSON.stringify(value, null, 2) + "\n");
      file(join(release, "contracts/bun-runtime.txt"), `# fake\nLinux x86_64 bun.zip 1 ${"0".repeat(64)} ${bun}\n`);
      json("herdr-source.json", { runtime: { artifacts: [{ name: "herdr-linux-aarch64", sha256: "f".repeat(64) }, { name: "herdr-linux-x86_64", sha256: herdr }] } });
      json("ripgrep-source.json", { artifacts: [{ platform: "linux", arch: "x64", binarySHA256: rg }] });
      json("fd-source.json", { artifacts: [{ platform: "linux", arch: "x64", binarySHA256: fd }] });
      json("pi-runtime.json", { version: "1.4.0", license: { sha256: "e".repeat(64) }, artifacts: [{ platform: "darwin", arch: "arm64", binarySHA256: "d".repeat(64) }, { platform: "linux", arch: "x64", binarySHA256: pi }] });
      json("agent-browser-source.json", { version: "0.41.0", artifacts: [{ platform: "linux", arch: "x64", sha256: "c".repeat(64) }] });
    } else {
      for (const name of readdirSync(contracts)) copyFileSync(join(contracts, name), join(release, "contracts", name));
    }
    file(join(data, "lab"), `#!/bin/sh\n# LAB-HARNESS owned launcher\nexport LAB_WORKSPACE_STATE_ROOT='${state}'\nexec '${release}/lab' "$@"\n`, 0o700);
    file(join(home, ".local/bin/lab"), `#!/bin/sh\n# LAB-HARNESS owned command shim\nexec '${data}/lab' "$@"\n`, 0o700);
    const route = { version: 1, kind: "azure", endpoint: `http://127.0.0.1:${server.port}/openai/v1`, model: "gpt-5.1", deployment: "gpt51-prod", apiVersion: "v1", authMode: "header", headerName: "Ocp-Apim-Subscription-Key", token: ROUTE_TOKEN };
    file(join(state, "route.json"), JSON.stringify(route) + "\n");
    file(join(state, "key"), ROUTE_KEY);
  }
  file(join(home, "certs/corp.pem"), "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n");
  const proxy = `http://alice:${PROXY_PASSWORD}@proxy.corp.example:8080`;
  const env: Record<string, string> = {
    HOME: home, PATH: `${join(home, ".local/bin")}:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: "C",
    LAB_QUALIFY_PROC_ROOT: proc, LAB_QUALIFY_OS_RELEASE: join(root, "os-release"), LAB_QUALIFY_WINDOWS_ROOT: win,
    LAB_QUALIFY_UNAME_S: "Linux", LAB_QUALIFY_UNAME_M: "x86_64", WSL_DISTRO_NAME: "Ubuntu",
    HTTPS_PROXY: proxy, HTTP_PROXY: proxy, NO_PROXY: "127.0.0.1,localhost,.corp.example", NODE_EXTRA_CA_CERTS: join(home, "certs/corp.pem"),
  };
  const run = async (args: string[] = []) => {
    const child = Bun.spawn([process.env.LAB_QUALIFY_TEST_SHELL ?? "/bin/sh", script, "--out", out, "--skip-smoke", ...args], { env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const text = readFileSync(join(out, "report.txt"), "utf8"), json = readFileSync(join(out, "report.json"), "utf8");
    return { code, stdout, stderr, text, json, report: JSON.parse(json) as { summary: Record<string, number | string>; checks: { id: string; status: string; detail: string }[] } };
  };
  const listing = () => {
    const entries: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (path === out) continue; const s = statSync(path); entries.push(`${relative(root, path)} ${s.mode} ${s.size} ${s.mtimeMs}`); if (s.isDirectory()) walk(path); } };
    walk(root); return entries.sort();
  };
  return { root, home, out, release, run, listing, clean: () => rmSync(root, { recursive: true, force: true }) };
}
const line = (output: string, status: string, id: string) => output.split("\n").find(l => new RegExp(`^${status} +${id.replace(/\./g, "\\.")} `).test(l));
function expectSanitized(home: string, ...outputs: string[]) {
  for (const output of outputs) {
    expect(output).not.toContain(home);
    expect(output).not.toContain("alice");
    expect(output).not.toContain(PROXY_PASSWORD);
    expect(output).not.toContain(ROUTE_KEY);
    expect(output).not.toContain(ROUTE_TOKEN.split(".")[1]!);
    expect(output).not.toMatch(/[A-Za-z0-9_+-]{32,}/);
    expect(output).not.toMatch(/Bearer (?!<redacted>)/);
  }
}

test("fake WSL2 target without runtimes: FAILs, SKIPs pending features, redacts and writes only its report", async () => {
  const f = fixture();
  try {
    const before = f.listing();
    const r = await f.run();
    expect(r.code, r.stderr).toBe(1);
    expect(r.stderr).toBe("");
    expect(line(r.stdout, "PASS", "env.wsl")).toContain("WSL2");
    expect(line(r.stdout, "PASS", "env.interop")).toContain("enabled");
    expect(line(r.stdout, "PASS", "env.arch")).toBeDefined();
    expect(line(r.stdout, "INFO", "env.distro")).toContain("Ubuntu 24.04.1 LTS");
    expect(line(r.stdout, "PASS", "install.launcher")).toContain(COMMIT.slice(0, 12));
    expect(line(r.stdout, "PASS", "install.command")).toBeDefined();
    expect(line(r.stdout, "SKIPPED", "install.version")).toContain("no lab --version");
    for (const id of ["runtime.bun", "runtime.herdr", "runtime.rg", "runtime.fd", "runtime.pi"]) expect(line(r.stdout, "FAIL", id)).toContain("missing");
    expect(line(r.stdout, "SKIPPED", "runtime.herdr-smoke")).toBeDefined();
    expect(line(r.stdout, "INFO", "net.proxy")).toContain("HTTPS_PROXY set: proxy.corp.example:8080 (credentials present, not shown)");
    expect(line(r.stdout, "PASS", "net.ca")).toContain("NODE_EXTRA_CA_CERTS=~/certs/corp.pem (1 certificates)");
    expect(line(r.stdout, "WARN", "net.passthrough")).toBeDefined();
    const route = line(r.stdout, "PASS", "route.saved")!;
    expect(route).toContain("kind=azure endpoint host=127.0.0.1 model=gpt-5.1 deployment=gpt51-prod apiVersion=v1 authMode=header headerName=Ocp-Apim-Subscription-Key");
    expect(line(r.stdout, "INFO", "route.fields")).toContain("token");
    expect(line(r.stdout, "PASS", "route.key")).toContain("content not read");
    expect(line(r.stdout, "PASS", "net.endpoint")).toContain("curl direct: TLS/HTTP ok, HTTP 401");
    expect(line(r.stdout, "SKIPPED", "net.endpoint-runtime")).toContain("needs a verified Bun");
    expect(line(r.stdout, "PASS", "browser.edge")).toContain("Edge 130.0.2849.80");
    expect(line(r.stdout, "WARN", "browser.agent-win32")).toContain("not installed in this release");
    expect(r.stdout).toContain("Summary: FAIL");
    expectSanitized(f.home, r.stdout, r.text, r.json);
    expect(r.report.summary.result).toBe("FAIL");
    for (const status of ["PASS", "FAIL", "WARN", "SKIPPED", "INFO"]) expect(r.report.summary[status.toLowerCase()]).toBe(r.report.checks.filter(c => c.status === status).length);
    expect(r.report.checks.find(c => c.id === "env.wsl")?.status).toBe("PASS");
    expect(f.listing()).toEqual(before);
    expect(readdirSync(f.out).sort()).toEqual(["report.json", "report.txt"]);
    expect(statSync(join(f.out, "report.json")).mode & 0o077).toBe(0);
  } finally { f.clean(); }
});

test("verified fake runtimes and route give exit 0 with pending features SKIPPED; a changed byte FAILs", async () => {
  const f = fixture({ runtimes: true });
  try {
    const r = await f.run();
    expect(r.code, r.stdout).toBe(0);
    for (const id of ["runtime.bun", "runtime.herdr", "runtime.rg", "runtime.fd", "runtime.pi"]) expect(line(r.stdout, "PASS", id)).toContain("matches the contract");
    expect(line(r.stdout, "PASS", "runtime.pi-tree")).toBeDefined();
    expect(line(r.stdout, "SKIPPED", "runtime.agent-browser")).toContain("optional");
    expect(line(r.stdout, "PASS", "net.endpoint-runtime")).toContain("HTTP 401");
    expect(line(r.stdout, "SKIPPED", "install.manifest")).toBeDefined();
    expect(r.report.summary.result).toBe("PASS");
    expect(r.report.summary.fail).toBe(0);
    expect(r.report.summary.skipped).toBeGreaterThan(0);
    expectSanitized(f.home, r.stdout, r.text, r.json);

    writeFileSync(join(f.release, ".tmp/rg/rg"), "#!/bin/sh\n# changed\n");
    const changed = await f.run(["--model-test"]);
    expect(changed.code).toBe(1);
    expect(line(changed.stdout, "FAIL", "runtime.rg")).toContain("does not match the contract");
    expect(line(changed.stdout, "FAIL", "model.prompt")).toContain("fake");
    expectSanitized(f.home, changed.stdout, changed.text, changed.json);
  } finally { f.clean(); }
});

test("non-WSL host without an installation reports SKIPPED/FAIL without crashing", async () => {
  const f = fixture({ wsl: "none", install: false, edge: false });
  try {
    const r = await f.run(["--browser-test"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("");
    expect(line(r.stdout, "SKIPPED", "env.wsl")).toContain("not WSL");
    expect(line(r.stdout, "SKIPPED", "env.interop")).toBeDefined();
    expect(line(r.stdout, "FAIL", "install.launcher")).toContain("install the bundle first");
    expect(line(r.stdout, "FAIL", "route.saved")).toContain("lab --configure");
    expect(line(r.stdout, "SKIPPED", "browser.edge")).toContain("not WSL");
    expect(line(r.stdout, "SKIPPED", "browser.roundtrip")).toContain("not WSL");
    expectSanitized(f.home, r.stdout, r.text, r.json);
  } finally { f.clean(); }
});

test("WSL1 fails; disabled interop and missing Edge WARN by default and FAIL with --browser-test", async () => {
  const one = fixture({ wsl: "1" });
  try { expect(line((await one.run()).stdout, "FAIL", "env.wsl")).toContain("WSL1"); } finally { one.clean(); }
  const f = fixture({ interop: "disabled", edge: false, runtimes: true });
  try {
    const plain = await f.run();
    expect(line(plain.stdout, "WARN", "env.interop")).toContain("disabled");
    expect(line(plain.stdout, "WARN", "browser.edge")).toContain("not found");
    expect(plain.code).toBe(0);
    const strict = await f.run(["--browser-test"]);
    expect(line(strict.stdout, "FAIL", "env.interop")).toBeDefined();
    expect(line(strict.stdout, "FAIL", "browser.edge")).toBeDefined();
    expect(line(strict.stdout, "SKIPPED", "browser.roundtrip")).toContain("no WSL Edge bridge");
    expect(strict.code).toBe(1);
  } finally { f.clean(); }
});

test("usage errors exit 2 and --help exits 0", () => {
  expect(Bun.spawnSync(["/bin/sh", script, "--bogus"]).exitCode).toBe(2);
  expect(Bun.spawnSync(["/bin/sh", script, "--out"]).exitCode).toBe(2);
  const help = Bun.spawnSync(["/bin/sh", script, "--help"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout.toString()).toContain("--model-test");
});
