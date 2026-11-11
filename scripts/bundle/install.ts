import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { command, digest, verifyManifest } from "./common.ts";

console.log("Verifying offline bundle manifest");
const bundle = resolve(process.argv[2] ?? "."), manifest = verifyManifest(bundle);
console.log(`Verified bundle ${manifest.version} (${manifest.commit}) for ${manifest.target}`);
if (manifest.target !== `${process.platform}-${process.arch}`) throw new Error(`Bundle target ${manifest.target} does not match ${process.platform}-${process.arch}`);
const home = process.env.HOME, data = process.env.XDG_DATA_HOME ?? (home ? join(home, ".local/share") : "");
if (!home || !isAbsolute(home) || !isAbsolute(data)) throw new Error("HOME and XDG_DATA_HOME must be absolute");
const root = join(data, "lab-harness"), releases = join(root, "releases"), destination = join(releases, manifest.commit);
function directories(path: string) {
  const parent = dirname(path); if (parent !== path) directories(parent);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Unsafe installation directory: ${path}`);
  if (!stat) mkdirSync(path, { mode: 0o700 });
}
const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
function owned(path: string, marker: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  return Boolean(stat?.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && readFileSync(path, "utf8").split("\n")[1] === marker);
}
function publish(path: string, text: string, marker: string) {
  if (lstatSync(path, { throwIfNoEntry: false }) && !owned(path, marker)) throw new Error(`Existing file is not LAB-owned: ${path}`);
  const temp = join(dirname(path), ".lab-" + randomUUID());
  try {
    writeFileSync(temp, text, { flag: "wx", mode: 0o700 });
    if (owned(path, marker)) renameSync(temp, path);
    else linkSync(temp, path); // An intervening foreign file must never be replaced.
  } finally { rmSync(temp, { force: true }); }
}
console.log("Checking owned installation paths");
directories(releases);
const lock = join(releases, ".bundle-install.lock");
mkdirSync(lock, { mode: 0o700 });
let stage: string | undefined;
try {
  const launcher = join(root, "lab");
  if (lstatSync(launcher, { throwIfNoEntry: false }) && !owned(launcher, "# LAB-HARNESS owned launcher")) throw new Error("Existing launcher is not LAB-owned; left untouched");
  if (lstatSync(destination, { throwIfNoEntry: false })) {
    const receipt = join(destination, ".tmp/bundle-receipt.json");
    if (!existsSync(receipt) || lstatSync(destination).isSymbolicLink()) throw new Error("Existing release is not an offline bundle install; move it aside explicitly");
    if (digest(readFileSync(receipt)) !== digest(JSON.stringify(manifest, null, 2) + "\n")) throw new Error("Existing release receipt differs");
    for (const [path, entry] of Object.entries(manifest.files)) {
      if (!path.startsWith("harness/")) continue;
      const installed = join(destination, path.slice(8)), stat = lstatSync(installed);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || digest(readFileSync(installed)) !== entry.sha256) throw new Error(`Existing release changed: ${path}`);
    }
  } else {
    stage = mkdtempSync(join(releases, ".bundle-"));
    cpSync(join(bundle, "harness"), stage, { recursive: true, dereference: false });
    cpSync(join(bundle, "LICENSES"), join(stage, ".tmp/bundle-licenses"), { recursive: true });
    writeFileSync(join(stage, ".tmp/bundle-receipt.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  }
  const candidate = stage ?? destination;
  const bunVersion = readFileSync(join(candidate, ".bun-version"), "utf8").trim();
  const bun = join(candidate, ".tmp/bun", bunVersion, "bun");
  const run = (args: string[]) => {
    const output = command(bun, ["--no-env-file", "--no-install", ...args], candidate);
    process.stdout.write(output);
  };
  run(["-e", 'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; assertPublishCapability(); import { verifyInstalledRuntime } from "./src/runtime/verify.ts"; verifyInstalledRuntime(); import { verifyBrowserRuntime } from "./src/browser/runtime.ts"; verifyBrowserRuntime();']);
  run(["scripts/check-publication.ts"]);
  run(["scripts/herdr/smoke.ts"]);
  if (stage) { renameSync(stage, destination); stage = undefined; }
  const launcherText = `#!/bin/sh\n# LAB-HARNESS owned launcher\nexport LAB_WORKSPACE_STATE_ROOT=${quote(join(home, ".local/share/lab-harness/workspace"))}\nexec ${quote(join(destination, "lab"))} "$@"\n`;
  publish(launcher, launcherText, "# LAB-HARNESS owned launcher");
  const bin = join(home, ".local/bin"), shim = join(bin, "lab"), existing = Bun.which("lab");
  if ((existing && existing !== shim) || (lstatSync(shim, { throwIfNoEntry: false }) && !owned(shim, "# LAB-HARNESS owned command shim"))) {
    console.log("Existing lab command left untouched; use the full launcher below.");
  } else {
    try {
      directories(bin);
      publish(shim, `#!/bin/sh\n# LAB-HARNESS owned command shim\nexec ${quote(launcher)} "$@"\n`, "# LAB-HARNESS owned command shim");
      console.log(`Command installed: ${shim}`);
    } catch (error) {
      console.log(`Optional command could not be installed: ${error instanceof Error ? error.message : "unknown error"}. Use the full launcher below.`);
    }
  }
  console.log(`Offline installation complete. No development packages installed.\nLauncher: ${launcher}`);
  process.stdout.write(command(launcher, ["--version"]));
} finally {
  if (stage) rmSync(stage, { recursive: true, force: true });
  rmSync(lock, { recursive: true, force: true });
}
