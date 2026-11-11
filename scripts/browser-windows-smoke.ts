/** Actual Windows Edge fixture; no model, personal profile, external page or policy changes. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserSession } from '../src/browser/session.ts';
import { WindowsInterop } from '../src/browser/windows.ts';
assert.equal(process.platform, 'win32');
mkdirSync(join(process.cwd(), '.tmp', 'windows-smoke'), { recursive: true });
process.env.TEMP = process.env.TMP = join(process.cwd(), '.tmp', 'windows-smoke');
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() {
  return new Response('<!doctype html><label>Name<input aria-label="Name"></label><button onclick="document.querySelector(\'input\').setAttribute(\'aria-label\',\'Saved \'+document.querySelector(\'input\').value)">Save</button>');
}});
const sessions: BrowserSession[] = [];
const ref = (snapshot: any, name: string) => '@' + Object.entries(snapshot.result.refs).find(([, v]: any) => v.name === name)![0];
try {
  const b = await BrowserSession.create(`http://127.0.0.1:${server.port}/`); sessions.push(b);
  const w = new WindowsInterop(); const root = w.localPath(w.root(b.descriptor.session));
  assert(existsSync(join(root, 'profile')), 'owned profile created');
  let s: any = await b.execute({ operation: 'snapshot' });
  await b.execute({ operation: 'fill', ref: ref(s, 'Name'), text: 'fixture' });
  s = await b.execute({ operation: 'snapshot' });
  await b.execute({ operation: 'click', ref: ref(s, 'Save') });
  s = await b.execute({ operation: 'snapshot' });
  assert(Object.values(s.result.refs).some((v: any) => v.name === 'Saved fixture'), 'click read back in independent snapshot');
  const read: any = await b.execute({ operation: 'read', ref: ref(s, 'Save') });
  assert.equal(read.result.text, 'Save');
  await b.close(); assert(!existsSync(root), 'Windows root and profile removed'); assert(!existsSync(b.descriptor.root), 'control root removed');
  // Kill a daemon outside the CLI: its Job Object must take Edge with it, and
  // close must clean without launching a replacement daemon.
  const crash = await BrowserSession.create(`http://127.0.0.1:${server.port}/`); sessions.push(crash);
  const crashedRoot = w.localPath(w.root(crash.descriptor.session));
  w.cleanup(crash.descriptor.session);
  await assert.rejects(crash.execute({ operation: 'snapshot' }), /LAB_BROWSER_SESSION_LOST/);
  await crash.close(); assert(!existsSync(crashedRoot));
  console.log(JSON.stringify({ passed: true, evidence: 'actual win32 agent-browser 0.41.0 + installed Windows Edge; local fixture only', operations: ['open', 'snapshot', 'fill', 'click', 'read', 'close', 'daemon termination'], ownedProfileRemoved: true }));
} finally {
  for (const s of sessions) await s.close();
  server.stop(true);
}
