import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { loadWorkspaceRoute, modelsForRoute, readPrivate, validateRoute, writePrivate } from "../src/pi/workspace-config.ts";
const roots: string[] = [];
const temporary = () => { const root = mkdtempSync(join(tmpdir(), "lab-route-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("self-hosted routes accept remote HTTP(S) endpoints and refuse embedded credentials or invalid URLs", () => {
  const route = validateRoute({version:1,kind:"local",endpoint:"http://127.0.0.1:8080/v1/",model:"local-model"});
  expect(route.endpoint).toBe("http://127.0.0.1:8080/v1");
  for (const endpoint of ["https://mini.tailnet.invalid:8459/v1", "http://lan.invalid:1234/v1", "https://remote.invalid/v1"]) expect(validateRoute({...route,endpoint}).kind).toBe("local");
  for (const endpoint of ["http://key@localhost/v1", "http://localhost/v1?key=x", "http://localhost/v1#fragment", "file:///tmp/model"]) expect(() => validateRoute({...route,endpoint})).toThrow();
  expect(validateRoute({...route,kind:"litellm",endpoint:"https://gateway.invalid/v1"}).kind).toBe("litellm");
});
test("keys stay in private state and models reference an environment variable", () => {
  const root = temporary(), route = validateRoute({version:1,kind:"litellm",endpoint:"https://gateway.invalid/v1",model:"alias"});
  writePrivate(join(root,"route.json"),JSON.stringify(route)); writePrivate(join(root,"key"),"private-fixture-value");
  expect(loadWorkspaceRoute(root).key).toBe("private-fixture-value");
  expect(statSync(join(root,"key")).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(modelsForRoute(route))).not.toContain("private-fixture-value");
  expect(JSON.stringify(modelsForRoute(route))).toContain("$LAB_WORKSPACE_API_KEY");
  chmodSync(join(root,"key"),0o644); expect(() => loadWorkspaceRoute(root)).toThrow("private regular file");
});
test("private input files refuse symlinks and replace atomically", () => {
  const root = temporary(), path = join(root,"key"); writePrivate(path,"old");
  writePrivate(path,"new"); expect(readPrivate(path)).toBe("new");
  symlinkSync(path,join(root,"link")); expect(() => readPrivate(join(root,"link"))).toThrow();
});

import { resolve } from "node:path";
import { workspaceStateRoot } from "../src/pi/workspace-config.ts";
test("stable state override requires explicit user-owned ancestors and rejects symlinks", () => {
  const root=mkdtempSync(join(homedir(),".lab-workspace-state-test-")); roots.push(root);
  expect(workspaceStateRoot(resolve("."),join(root,"app"))).toBe(join(root,"app"));
  expect(()=>workspaceStateRoot(resolve("."),"relative/path")).toThrow("absolute");
  expect(()=>workspaceStateRoot(resolve("."),"/etc/lab-state")).toThrow("beneath");
  symlinkSync(join(root,"app"),join(root,"link")); expect(()=>workspaceStateRoot(resolve("."),join(root,"link/state"))).toThrow("symlinks");
  chmodSync(join(root,"app"),0o770); expect(()=>workspaceStateRoot(resolve("."),join(root,"app/state"))).toThrow("shared write");
});
test("default state is private user app data, and overrides cannot write into code or project", () => {
  const root=mkdtempSync(join(homedir(),".lab-workspace-state-test-")); roots.push(root);
  const install=join(root,"release A"), project=join(root,"project B");
  mkdirSync(install); mkdirSync(project);
  expect(()=>workspaceStateRoot(install,join(install,"state"),project)).toThrow("outside");
  expect(()=>workspaceStateRoot(install,join(project,"state"),project)).toThrow("outside");
  const state=workspaceStateRoot(install,join(root,"private app"),project);
  expect(statSync(state).mode & 0o777).toBe(0o700);
  const env:NodeJS.ProcessEnv={...process.env,HOME:root}; delete env.LAB_WORKSPACE_STATE_ROOT;
  const probe=Bun.spawnSync([process.execPath,"--no-env-file","--no-install","--eval",`import {workspaceStateRoot} from ${JSON.stringify(resolve(import.meta.dir,"../src/pi/workspace-config.ts"))}; console.log(workspaceStateRoot(${JSON.stringify(install)},undefined,${JSON.stringify(project)}));`],{env});
  expect(probe.exitCode).toBe(0);
  expect(probe.stdout.toString().trim()).toBe(join(root,".local/share/lab-harness/workspace"));
});
