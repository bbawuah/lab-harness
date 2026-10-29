import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWorkspaceRoute, modelsForRoute, readPrivate, validateRoute, writePrivate } from "../src/pi/workspace-config.ts";
const roots: string[] = [];
const temporary = () => { const root = mkdtempSync(join(tmpdir(), "lab-route-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("explicit route validation refuses implicit cloud routes and credentials in URLs", () => {
  const route = validateRoute({version:1,kind:"local",endpoint:"http://127.0.0.1:8080/v1/",model:"local-model"});
  expect(route.endpoint).toBe("http://127.0.0.1:8080/v1");
  for (const endpoint of ["https://remote.invalid/v1", "http://key@localhost/v1", "http://localhost/v1?key=x", "file:///tmp/model"]) expect(() => validateRoute({...route,endpoint})).toThrow();
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
