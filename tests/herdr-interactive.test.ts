import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyHerdrInteractive } from "../src/herdr/interactive.ts";
test("interactive attachment refuses unpinned binaries before starting any process", () => {
  const root=mkdtempSync(join(tmpdir(),"herdr-unpinned-"));
  try { const file=join(root,"fake");writeFileSync(file,"not an official runtime");expect(()=>verifyHerdrInteractive(file)).toThrow("unverified"); }
  finally { rmSync(root,{recursive:true,force:true}); }
});
