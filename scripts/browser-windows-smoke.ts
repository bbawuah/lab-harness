/** Actual Windows Edge fixture; no model, personal profile, external page or policy changes. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserSession } from '../src/browser/session.ts';
import { WindowsInterop, windowsBrowser } from '../src/browser/windows.ts';
assert(windowsBrowser(), 'run on Windows CI or the real WSL target');
mkdirSync(join(process.cwd(), '.tmp', 'windows-smoke'), { recursive: true });
process.env.TMPDIR = process.env.TEMP = process.env.TMP = join(process.cwd(), '.tmp', 'windows-smoke');
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() {
  return new Response('<!doctype html><label>Name<input aria-label="Name"></label><button onclick="document.querySelector(\'input\').setAttribute(\'aria-label\',\'Saved \'+document.querySelector(\'input\').value)">Save</button>', { headers: { 'content-type': 'text/html' } });
}});
const sessions: BrowserSession[] = [];
const ref = (snapshot: any, name: string) => '@' + Object.entries(snapshot.result.refs).find(([, v]: any) => v.name === name)![0];
try {
  console.log('fixture: opening installed Edge');
  const b = await BrowserSession.create(`http://127.0.0.1:${server.port}/`); sessions.push(b);
  const w = new WindowsInterop(); const root = w.localPath(w.root(b.descriptor.session));
  assert(readdirSync(join(root, 't')).some(n => n.startsWith('agent-browser-chrome-')), 'owned ephemeral profile created');
  console.log('fixture: opened; taking snapshot');
  let s: any = await b.execute({ operation: 'snapshot' });
  console.log('fixture: filling');
  await b.execute({ operation: 'fill', ref: ref(s, 'Name'), text: 'fixture' });
  s = await b.execute({ operation: 'snapshot' });
  console.log('fixture: clicking');
  await b.execute({ operation: 'click', ref: ref(s, 'Save') });
  s = await b.execute({ operation: 'snapshot' });
  assert(Object.values(s.result.refs).some((v: any) => v.name === 'Saved fixture'), 'click read back in independent snapshot');
  const read: any = await b.execute({ operation: 'read', ref: ref(s, 'Save') });
  assert.equal(read.result.text, 'Save');
  console.log('fixture: read-back passed; opening concurrent guard');
  const guard = await BrowserSession.create(`http://127.0.0.1:${server.port}/`); sessions.push(guard);
  const guardRoot = w.localPath(w.root(guard.descriptor.session));
  console.log('fixture: closing first session');
  await b.close(); assert(!existsSync(root), 'Windows root and profile removed'); assert(!existsSync(b.descriptor.root), 'control root removed');
  // Kill a daemon outside the CLI: its Job Object must take Edge with it, and
  // close must clean without launching a replacement daemon.
  console.log('fixture: checking daemon termination');
  const crash = await BrowserSession.create(`http://127.0.0.1:${server.port}/`); sessions.push(crash);
  const crashedRoot = w.localPath(w.root(crash.descriptor.session));
  w.cleanup(crash.descriptor.session);
  await assert.rejects(crash.execute({ operation: 'snapshot' }), /LAB_BROWSER_SESSION_LOST/);
  await crash.close(); assert(!existsSync(crashedRoot));
  assert(existsSync(guardRoot), 'concurrent owned session kept');
  const guardSnapshot: any = await guard.execute({ operation: 'snapshot' });
  assert(Object.values(guardSnapshot.result.refs).some((v: any) => v.name === 'Name'), 'other Edge session still usable');
  await guard.close(); assert(!existsSync(guardRoot));
  console.log(JSON.stringify({ passed: true, evidence: 'actual win32 agent-browser 0.41.0 + installed Windows Edge; local fixture only', operations: ['open', 'snapshot', 'fill', 'click', 'read', 'close', 'daemon termination', 'concurrent session isolation'], ownedProfileRemoved: true }));
} finally {
  try { for (const s of sessions) await s.close(); } finally { server.stop(true); }
}
