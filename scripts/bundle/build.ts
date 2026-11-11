import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { command, digest, files, type FileIdentity, type Manifest } from "./common.ts";
import { pack } from "./pack.ts";

const root = resolve(import.meta.dir, "../.."), args = process.argv.slice(2);
const options: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--commit", "--target", "--out"].includes(args[i]!) || !args[i + 1] || options[args[i]!]) throw new Error("Usage: build.ts [--commit REF] [--target linux-x64|darwin-arm64] [--out DIR]");
  options[args[i]!] = args[i + 1]!;
}
const target = options["--target"] ?? "linux-x64";
if (!["linux-x64", "darwin-arm64"].includes(target)) throw new Error("Unsupported bundle target");
const [platform, arch] = target.split("-");
const commit = command("git", ["rev-parse", "--verify", `${options["--commit"] ?? "HEAD"}^{commit}`], root).toString().trim();
const out = resolve(options["--out"] ?? join(root, ".tmp/bundles", target)); mkdirSync(out, { recursive: true });
const cache = join(root, ".tmp/bundle-downloads"); mkdirSync(cache, { recursive: true });
const work = mkdtempSync(join(root, ".tmp/bundle-build-")), bundle = join(work, "bundle"), harness = join(bundle, "harness");
mkdirSync(harness, { recursive: true });
const origins = new Map<string, { sourceURL: string; license: string }>();
function put(path: string, data: Uint8Array | string, sourceURL: string, license: string, executable = false) {
  mkdirSync(dirname(join(bundle, path)), { recursive: true }); writeFileSync(join(bundle, path), data, { mode: executable ? 0o755 : 0o644 }); origins.set(path, { sourceURL, license });
}
function download(url: string, expected: string, size?: number): string {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error("Artifact has no pinned SHA-256");
  const path = join(cache, expected), stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) {
    const temporary = join(work, "download");
    command("curl", ["-fL", "--retry", "2", "--connect-timeout", "15", "--max-time", "240", "--max-filesize", String(size ?? 268435456), "-o", temporary, url]);
    if (digest(readFileSync(temporary)) !== expected || (size !== undefined && lstatSync(temporary).size !== size)) throw new Error(`Download identity mismatch: ${url}`);
    copyFileSync(temporary, path); rmSync(temporary);
  }
  if (lstatSync(path).isSymbolicLink() || digest(readFileSync(path)) !== expected || (size !== undefined && lstatSync(path).size !== size)) throw new Error(`Corrupt download cache: ${expected}`);
  return path;
}
const json = (path: string) => JSON.parse(readFileSync(join(harness, path), "utf8"));
try {
  const sourceArchive = join(work, "source.tar");
  writeFileSync(sourceArchive, command("git", ["archive", "--format=tar", commit], root));
  command("tar", ["-xf", sourceArchive, "-C", harness]);
  const version = json("package.json").version;
  if (!/^[\w.-]+$/.test(version)) throw new Error("Invalid version");
  const sourceURL = `https://github.com/bbawuah/lab-harness/tree/${commit}`;
  for (const path of files(harness)) origins.set(`harness/${path}`, { sourceURL: `${sourceURL}/${path}`, license: "UNLICENSED; see harness/NOTICE.md" });
  const bunVersion = readFileSync(join(harness, ".bun-version"), "utf8").trim();
  const row = readFileSync(join(harness, "contracts/bun-runtime.txt"), "utf8").split("\n").find(l => l.startsWith(`${platform === "linux" ? "Linux x86_64" : "Darwin arm64"} `));
  if (!row) throw new Error("Missing Bun contract");
  const [, , asset, size, archiveHash, binaryHash] = row.split(/\s+/) as string[];
  const bunURL = `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${asset}`;
  const bun = command("unzip", ["-p", download(bunURL, archiveHash!, Number(size)), `${asset!.replace(/\.zip$/, "")}/bun`]);
  if (digest(bun) !== binaryHash) throw new Error("Bun binary mismatch");
  put(`harness/.tmp/bun/${bunVersion}/bun`, bun, bunURL, "MIT AND LGPL-2.1; see LICENSES/bun-LICENSE.md", true);
  const herdr = json("contracts/herdr-source.json");
  const herdrArtifact = herdr.runtime.artifacts.find((a: { name: string }) => a.name === `herdr-${platform === "linux" ? "linux-x86_64" : "macos-aarch64"}`);
  if (!herdrArtifact) throw new Error("Missing Herdr contract");
  put("harness/.tmp/herdr/herdr", readFileSync(download(herdrArtifact.url, herdrArtifact.sha256)), herdrArtifact.url, "Apache-2.0", true);
  for (const [name, contract] of [["rg", "ripgrep-source"], ["fd", "fd-source"]]) {
    const source = json(`contracts/${contract}.json`), a = source.artifacts.find((a: { platform: string; arch: string }) => a.platform === platform && a.arch === arch);
    if (!a) throw new Error(`Missing ${name} contract`);
    const archive = download(a.url, a.archiveSHA256, a.archiveBytes), data = command("tar", ["-xOf", archive, a.member]);
    if (digest(data) !== a.binarySHA256) throw new Error(`${name} binary mismatch`);
    put(`harness/.tmp/${name}/${name}`, data, a.url, source.license ?? "MIT OR Unlicense", true);
    const members = command("tar", ["-tzf", archive]).toString().trim().split("\n");
    for (const member of members.filter(m => /\/(?:LICENSE[^/]*|COPYING|UNLICENSE|NOTICE[^/]*)$/i.test(m))) {
      put(`LICENSES/${name}-${member.split("/").at(-1)}`, command("tar", ["-xOf", archive, member]), a.url, source.license ?? "MIT OR Unlicense");
    }
  }
  const pi = json("contracts/pi-runtime.json"), a = pi.artifacts.find((a: { platform: string; arch: string }) => a.platform === platform && a.arch === arch);
  if (!a) throw new Error("Missing Pi contract");
  const piRoot = `harness/.tmp/pi/${pi.version}/${target}`;
  mkdirSync(join(bundle, piRoot), { recursive: true });
  command("tar", ["-xzf", download(a.url, a.archiveSHA256, a.archiveBytes), "-C", join(bundle, piRoot)]);
  const piFiles = files(join(bundle, piRoot));
  // Verify the complete pinned Pi tree without executing the target binary.
  const piDir = join(bundle, piRoot, "pi"), lines: { path: string; line: string }[] = [];
  function tree(path = "") {
    for (const name of readdirSync(join(piDir, path)).sort()) {
      const rel = path ? `${path}/${name}` : name, stat = lstatSync(join(piDir, rel));
      if (stat.isDirectory()) { lines.push({ path: rel, line: `D ${rel}\n` }); tree(rel); }
      else lines.push({ path: rel, line: `F ${rel} ${stat.size} ${digest(readFileSync(join(piDir, rel)))}\n` });
    }
  }
  tree();
  if (digest(lines.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(l => l.line).join("")) !== a.treeSHA256 || digest(readFileSync(join(piDir, "pi"))) !== a.binarySHA256) throw new Error("Pi tree mismatch");
  for (const path of piFiles) origins.set(`${piRoot}/${path}`, { sourceURL: a.url, license: pi.license.spdx });
  if (digest(pi.license.text) !== pi.license.sha256) throw new Error("Pi license mismatch");
  put("LICENSES/pi-LICENSE", pi.license.text, pi.license.url, pi.license.spdx);
  const browser = json("contracts/agent-browser-source.json");
  const browserArtifacts = browser.artifacts.filter((a: { platform: string; arch: string }) => (a.platform === platform && a.arch === arch) || (platform === "linux" && a.platform === "win32" && a.arch === "x64"));
  if (!browserArtifacts.some((a: { platform: string }) => a.platform === platform)) throw new Error("Missing agent-browser target contract");
  if (platform === "linux" && !browserArtifacts.some((a: { platform: string }) => a.platform === "win32")) console.warn("Windows agent-browser contract absent; WSL Edge bridge is not included in this build.");
  for (const a of browserArtifacts) {
    const name = a.platform === platform ? "agent-browser" : new URL(a.url).pathname.split("/").at(-1)!;
    put(`harness/.tmp/browser/${name}`, readFileSync(download(a.url, a.sha256, a.bytes)), a.url, browser.license, true);
  }
  if (digest(browser.licenseText) !== browser.licenseSHA256) throw new Error("Browser license mismatch");
  put("LICENSES/agent-browser-LICENSE", browser.licenseText, browser.licenseUrl, browser.license);
  for (const license of json("scripts/bundle/licenses.json")) put(`LICENSES/${license.name}`, readFileSync(download(license.url, license.sha256)), license.url, license.license);
  put("LICENSES/harness-NOTICE.md", readFileSync(join(harness, "NOTICE.md")), `${sourceURL}/NOTICE.md`, "UNLICENSED");
  put("harness/.tmp/release-commit", commit + "\n", sourceURL, "UNLICENSED");
  put("install.sh", readFileSync(join(harness, "scripts/bundle/install.sh")), sourceURL + "/scripts/bundle/install.sh", "UNLICENSED", true);
  const entries: Record<string, FileIdentity> = {};
  for (const path of files(bundle)) {
    const stat = lstatSync(join(bundle, path));
    entries[path] = { sha256: digest(readFileSync(join(bundle, path))), bytes: stat.size, executable: Boolean(stat.mode & 0o111), ...origins.get(path)! };
    if (!entries[path]!.sourceURL) throw new Error(`Missing provenance: ${path}`);
    chmodSync(join(bundle, path), entries[path]!.executable ? 0o755 : 0o644);
  }
  const manifest: Manifest = { schemaVersion: 1, version, commit, target, files: entries };
  writeFileSync(join(bundle, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  const filename = `lab-harness-${version}-${target}.tar.gz`, destination = join(out, filename);
  await pack(bundle, destination);
  const sha256 = digest(readFileSync(destination));
  writeFileSync(join(out, "SHA256SUMS"), `${sha256}  ${filename}\n`);
  console.log(JSON.stringify({ file: destination, bytes: lstatSync(destination).size, sha256, commit, target }));
} finally { rmSync(work, { recursive: true, force: true }); }
