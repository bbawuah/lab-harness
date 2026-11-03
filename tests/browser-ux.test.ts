import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { BrowserFailure, BrowserSession } from '../src/browser/session.ts';
import { chip, classify, closedReason, failureRecord, recoveryText, statusLines, verdict, type BrowserFailureInfo, type LifecycleView } from '../src/browser/states.ts';
import { setupSummary } from '../src/browser/runtime.ts';
import { installBrowserExtension } from '../src/pi/browser-extension.ts';
import { indicatorSlots, indicatorText, setIndicator } from '../src/pi/status-indicator.ts';
import { fitColumns } from '../src/pi/terminal-text.ts';
import { shellOptions, shellUsage, shellHelp } from '../src/pi/commands.ts';

const widths = [40, 80, 120];
const hostile = '\u001b[31m‮⁦界👨‍👩‍👧\u0007\ud800é';
const controls = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]|[\ud800-\udbff](?![\udc00-\udfff])/;
const ORIGIN = 'http://127.0.0.1:53508';
const lifecycle = { reused: true, launched: false, relaunchedBrowser: false, effectiveLaunch: { launchHash: 'h' } };

/** Envelope exactly as projection.ts accepts it (agent-browser 0.41.0 one-shot MCP). */
function envelope(data: any, content?: string) {
  const r = { _boundary: { nonce: 'a'.repeat(32), origin: ORIGIN + '/' }, data: { ...data, lifecycle }, error: null, success: true };
  return JSON.stringify({ _meta: { agentBrowserVersion: '0.41.0' }, content: [{ type: 'text', text: content ?? JSON.stringify(r) }], isError: false, structuredContent: { exitCode: 0, response: r, stdout: JSON.stringify(r), stderr: '' } });
}
type Plan = { url?: string; tabs?: number; fail?: Partial<Record<string, string>>; closeFails?: boolean; daemonDead?: boolean };
/** Real BrowserSession logic over a scripted private transport; records every command sent. */
function scripted(plan: Plan = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lab-browser-ux-')); for (const n of ['s', 't']) mkdirSync(join(root, n), { mode: 0o700 });
  const sent: string[] = [];
  const s: any = Object.create(BrowserSession.prototype);
  Object.assign(s, { descriptor: { root, session: 'lab-' + 'c'.repeat(24), origin: ORIGIN, launchHash: 'h' }, queue: Promise.resolve(), refs: new Set(), issued: new Set(), labels: new Map(), actions: 0, pendingChange: false, closed: false, binary: '/nonexistent' });
  s.daemonAlive = () => !plan.daemonDead;
  s.run = async (args: string[]) => {
    if (args[1] === 'close') { sent.push('close'); if (plan.closeFails) throw new Error('LAB_BROWSER_TIMEOUT'); return JSON.stringify({ success: true }); }
    const tool = args[2]!; sent.push(tool);
    const failure = plan.fail?.[tool]; if (failure) throw new Error(failure);
    if (tool === 'agent_browser_get_url') return envelope({ url: plan.url ?? ORIGIN + '/' });
    if (tool === 'agent_browser_tab_list') return envelope({ tabs: Array.from({ length: plan.tabs ?? 1 }, () => ({ url: ORIGIN + '/' })) });
    if (tool === 'agent_browser_snapshot') { const snapshot = '- textbox "Name" [ref=e1]\n- button "Save" [ref=e2]'; return envelope({ origin: ORIGIN + '/', refs: { e1: { name: 'Name', role: 'textbox' }, e2: { name: 'Save', role: 'button' } }, removedRefs: [], snapshot }, snapshot); }
    if (tool === 'agent_browser_fill') return envelope({ filled: JSON.parse(args[3]!).selector });
    if (tool === 'agent_browser_click') return envelope({ clicked: JSON.parse(args[3]!).selector });
    if (tool === 'agent_browser_get_text') return envelope({ origin: ORIGIN + '/', text: 'Saved: Alpha' }, 'Saved: Alpha');
    throw new Error('unexpected ' + tool);
  };
  return { s: s as BrowserSession, sent, root, done: () => rmSync(root, { recursive: true, force: true }) };
}
const failureOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(BrowserFailure); return (e as BrowserFailure).info; } throw new Error('expected failure'); };

test('stale and unknown refs are refused before anything is sent; browser stays active', async () => {
  const { s, sent, done } = scripted();
  try {
    const snap: any = await s.execute({ operation: 'snapshot' });
    expect(snap.operation).toBe('snapshot'); expect(s.refLabel('@e1')).toEqual({ role: 'textbox', name: 'Name' });
    const fill: any = await s.execute({ operation: 'fill', ref: '@e1', text: 'Alpha' });
    expect(fill.ref).toBe('@e1'); expect(s.refLabel('@e1')).toBeUndefined();
    const before = sent.length;
    const stale = await failureOf(s.execute({ operation: 'click', ref: '@e2' }));
    expect(stale).toMatchObject({ code: 'LAB_BROWSER_STALE_REF', phase: 'pre', staleKind: 'stale', ref: '@e2', operation: 'click' });
    expect(classify(stale)).toBe('stale'); expect(recoveryText(stale, ORIGIN)).toContain('Nothing was sent');
    const unknown = await failureOf(s.execute({ operation: 'read', ref: '@e9' }));
    expect(unknown.staleKind).toBe('unknown'); expect(recoveryText(unknown, ORIGIN)).toContain('never issued');
    const nav = await failureOf(s.execute({ operation: 'navigate', url: 'http://127.0.0.1:1/' }));
    expect(classify(nav)).toBe('refused'); expect(recoveryText(nav, ORIGIN)).toContain('stay on ' + ORIGIN);
    expect(sent.length).toBe(before); // nothing reached the transport
    expect(s.view()).toMatchObject({ state: 'active', actions: 2, last: 'fill @e1' });
    const again: any = await s.execute({ operation: 'snapshot' }); expect(again.verifies).toBe(true);
    const read: any = await s.execute({ operation: 'read', ref: '@e1' }); expect(read.verifies).toBeUndefined();
  } finally { done(); }
});

test('uncertain mutation, breach, new tab and daemon loss close the run with the right state and recovery', async () => {
  const cases: [Plan, string, (s: BrowserSession) => Promise<unknown>, string, RegExp][] = [
    [{ fail: { agent_browser_click: 'LAB_BROWSER_TIMEOUT' } }, 'uncertain', s => s.execute({ operation: 'click', ref: '@e2' }), 'click @e2 timed out, result unknown. Check the page yourself before trying again.', /lab --browser http:\/\/127\.0\.0\.1:53508\/$/],
    [{ fail: { agent_browser_get_text: 'LAB_BROWSER_CANCELLED' } }, 'uncertain', s => s.execute({ operation: 'read', ref: '@e1' }), 'nothing was changed by this read', /lab --browser/],
    [{}, 'breach', async s => { (s as any).run = wrapUrl((s as any).run, 'http://127.0.0.1:1/'); return s.execute({ operation: 'click', ref: '@e2' }); }, 'page left ' + ORIGIN, /lab --browser/],
    [{}, 'breach', async s => { (s as any).run = wrapTabs((s as any).run); return s.execute({ operation: 'click', ref: '@e2' }); }, 'opened another tab', /lab --browser/],
    [{}, 'lost', async s => { (s as any).run = wrapLost((s as any).run); return s.execute({ operation: 'fill', ref: '@e1', text: 'x' }); }, 'daemon exited or was replaced', /lab --browser/],
    [{ fail: { agent_browser_click: 'LAB_BROWSER_TIMEOUT' }, closeFails: true }, 'cleanup-failed', s => s.execute({ operation: 'click', ref: '@e2' }), 'run /lab-browser close to retry cleanup', /cleanup\.$/],
  ];
  for (const [plan, state, act, text, tail] of cases) {
    const { s, root, done } = scripted(plan);
    try {
      await s.execute({ operation: 'snapshot' });
      const info = await failureOf(act(s));
      expect(info.phase).toBe('action'); expect(classify(info)).toBe(state as any);
      const recovery = recoveryText(info, ORIGIN); expect(recovery).toContain(text); expect(recovery).toMatch(tail);
      const view = s.view();
      if (state === 'cleanup-failed') { expect(view.state).toBe('cleanup-failed'); expect(existsSync(root)).toBe(true); expect(chip(view)).toEqual({ glyph: '!', label: 'web', detail: 'cleanup · /lab-browser close' }); }
      else { expect(view.state).toBe('closed'); expect(existsSync(root)).toBe(false); expect(chip(view).glyph).toBe('○'); expect(statusLines(view)[0]).toBe('○ ' + recovery);
        expect(indicatorText(chip(view))).toBe('○ web closed · ' + (({ breach: 'left origin', lost: 'connection lost' } as any)[state as string] ?? (/^(fill|click|navigate)$/.test(info.operation ?? '') ? 'result unknown' : 'read failed'))); }
      const after = await failureOf(s.execute({ operation: 'snapshot' })); // no further action, ever
      expect(classify(after)).toBe('closed');
    } finally { done(); }
  }
});
/** Rewrite response data consistently (response, stdout and content stay equal, as projection requires). */
function edit(r: string, f: (data: any) => void) { const o = JSON.parse(r); f(o.structuredContent.response.data); o.structuredContent.stdout = JSON.stringify(o.structuredContent.response); o.content[0].text = o.structuredContent.stdout; return JSON.stringify(o); }
// Scope checks run before and after each action; the second check per action sees the post-action page.
function wrapUrl(run: any, url: string) { let n = 0; return async (a: string[]) => { const r = await run(a); return a[2] === 'agent_browser_get_url' && ++n > 1 ? edit(r, d => { d.url = url; }) : r; }; }
function wrapTabs(run: any) { let n = 0; return async (a: string[]) => { const r = await run(a); return a[2] === 'agent_browser_tab_list' && ++n > 1 ? edit(r, d => { d.tabs = [{ url: ORIGIN + '/' }, { url: ORIGIN + '/second' }]; }) : r; }; }
// A relaunched daemon reports a different launch identity.
function wrapLost(run: any) { return async (a: string[]) => { const r = await run(a); return a[2] === 'agent_browser_get_url' ? edit(r, d => { d.lifecycle = { ...d.lifecycle, effectiveLaunch: { launchHash: 'other' } }; }) : r; }; }

test('chip and status rows fit 40/80/120 columns and escape hostile origins and text', () => {
  const info: BrowserFailureInfo = { code: 'LAB_BROWSER_TIMEOUT', operation: 'click', ref: '@e5', phase: 'action', cleanup: 'done' };
  const origin = 'http://' + 'x'.repeat(90) + hostile;
  const views: LifecycleView[] = [{ state: 'active', origin, actions: 3, last: 'click @e4' }, { state: 'closed', origin }, { state: 'closed', origin, failure: info }, { state: 'cleanup-failed', origin, failure: info }];
  for (const v of views) {
    const text = indicatorText(chip(v));
    expect(Bun.stringWidth(text)).toBeLessThanOrEqual(48); expect(text).not.toMatch(controls);
    for (const width of widths) for (const row of statusLines(v).flatMap(l => fitColumns(l, width) ? [fitColumns(l, width)] : [])) { expect(Bun.stringWidth(row)).toBeLessThanOrEqual(width); expect(row).not.toMatch(controls); }
  }
  expect(indicatorText(chip({ state: 'active', origin: ORIGIN, actions: 0 }))).toBe('● web 127.0.0.1:53508');
  expect(indicatorText(chip({ state: 'closed', origin: ORIGIN }))).toBe('○ web closed');
  expect(statusLines({ state: 'closed', origin: ORIGIN })).toEqual(['○ browser closed. Start a new run: lab --browser http://127.0.0.1:53508/']);
  expect(statusLines({ state: 'active', origin: ORIGIN, actions: 1, last: 'click @e4' })).toEqual(['● browser http://127.0.0.1:53508 only · private profile', '  1 action · last: click @e4 · /lab-browser close']);
  const calls: [string, string | undefined][] = []; setIndicator({ setStatus: (k, t) => calls.push([k, t]) }, 'lab-mode', { glyph: '●', label: 'ask' }); setIndicator({ setStatus: (k, t) => calls.push([k, t]) }, 'lab-mode', undefined); setIndicator(undefined, 'lab-mode', { glyph: '!', label: 'x' });
  expect(calls).toEqual([['lab-mode', '● ask'], ['lab-mode', undefined]]); expect(() => setIndicator({}, 'Bad Key' as any, undefined)).toThrow('LAB_INDICATOR_KEY');
});

test('verdict comes from tool results only', () => {
  const ok = (operation: string, extra = {}) => ({ isError: false, details: { operation, ...extra } });
  expect(verdict([])).toBeUndefined();
  expect(verdict([ok('snapshot'), ok('fill'), ok('click'), ok('read')])).toBe('✓ browser: 1 snapshot · 1 fill · 1 click · 1 read · read back after change');
  expect(verdict([ok('snapshot'), ok('fill')])).toBe('! browser: page changed, not read back · 1 snapshot · 1 fill');
  expect(verdict([ok('snapshot'), { isError: true, details: { operation: 'click', state: 'stale' } }, ok('snapshot')])).toBe('✓ browser: 2 snapshot · 1 refused');
  expect(verdict([{ isError: true, details: {} }])).toBe('! browser: nothing sent · 1 refused'); // Pi validation error / denied approval
  expect(verdict([ok('snapshot'), { isError: true, details: { operation: 'click', state: 'uncertain' } }])).toBe('✗ browser: 1 failed (result unknown) · 1 snapshot · browser closed');
  expect(verdict([ok('snapshot'), { isError: true, details: { operation: 'click', state: 'breach' } }])).toBe('✗ browser: 1 failed (left origin) · 1 snapshot · browser closed');
  expect(verdict([{ isError: true, details: { operation: 'snapshot', state: 'lost' } }])).toBe('✗ browser: 1 failed (disconnected) · browser closed');
  expect(verdict([{ isError: false, details: { operation: 'evil\u001b' } }, { isError: false, details: 'x' }])).toBe('! browser: nothing sent · '); // unknown shapes are ignored, never trusted
});

test('extension: chip, failure rows, transcript entries and verdict at 40/80/120', async () => {
  const { s, done } = scripted({ fail: { agent_browser_click: 'LAB_BROWSER_TIMEOUT' } });
  const dir = mkdtempSync(join(tmpdir(), 'lab-browser-ux-ref-')); const ref = join(dir, 'ref.json'); writeFileSync(ref, '{}', { mode: 0o600 });
  const saved = process.env.LAB_BROWSER_REF, orig = (BrowserSession as any).rebind; process.env.LAB_BROWSER_REF = ref; (BrowserSession as any).rebind = () => s;
  const handlers: Record<string, any> = {}, entries: any[] = [], status: (string | undefined)[] = []; let tool: any, command: any, renderer: any;
  const ctx = { ui: { notify() {}, setStatus: (_k: string, t: string | undefined) => status.push(t) } };
  try {
    installBrowserExtension({ on: (n: string, f: any) => { handlers[n] = f; }, registerTool: (t: any) => { tool = t; }, registerCommand: (_n: string, c: any) => { command = c; }, sendMessage() {}, appendEntry: (type: string, data: any) => entries.push({ type, data }), registerEntryRenderer: (_t: string, r: any) => { renderer = r; } } as any);
    handlers.session_start({}, ctx); expect(status.at(-1)).toBe('● web 127.0.0.1:53508');
    handlers.agent_start();
    const results: any[] = [];
    for (const params of [{ operation: 'snapshot' }, { operation: 'fill', ref: '@e1', text: 'A' }, { operation: 'click', ref: '@e2' }, { operation: 'snapshot' }, { operation: 'click', ref: '@e2' }]) {
      const r = await tool.execute('id', params, undefined, undefined, ctx); results.push(r); handlers.tool_execution_end({ toolName: 'lab_browser', isError: !!r.isError, result: r });
    }
    expect(results[2].details).toMatchObject({ state: 'stale', ref: '@e2', operation: 'click' });
    expect(results[2].content[0].text).toStartWith('LAB_BROWSER_STALE_REF: @e2 is stale');
    expect(results[4].details).toMatchObject({ state: 'uncertain', error: expect.stringContaining('LAB_BROWSER_TIMEOUT') });
    expect(results[4].content[0].text).toContain('Check the page yourself before trying again');
    expect(status.at(-1)).toBe('○ web closed · result unknown');
    handlers.agent_end({}, ctx);
    expect(entries.at(-1).data.lines).toEqual(['✗ browser: 1 failed (result unknown) · 2 snapshot · 1 fill · 1 refused · browser closed']);
    await command.handler('status', ctx); expect(entries.at(-1).data.lines[0]).toContain('○ Browser closed: click @e2 timed out');
    for (const width of widths) {
      const rows = [...tool.renderResult(results[2], {}, undefined, { isError: true }).render(width), ...tool.renderResult(results[4], {}, undefined, { isError: true }).render(width), ...renderer(entries.at(-1), {}).render(width), ...renderer({ data: { lines: [hostile.repeat(20)] } }, {}).render(width)];
      for (const row of rows) { expect(Bun.stringWidth(row)).toBeLessThanOrEqual(width); expect(row).not.toMatch(controls); }
    }
    expect(tool.renderResult(results[2], {}, undefined, { isError: true }).render(120)[0]).toBe('! Browser · click @e2');
    expect(renderer({ data: 'junk' }, {}).render(40)).toEqual(['']);
  } finally { (BrowserSession as any).rebind = orig; if (saved) process.env.LAB_BROWSER_REF = saved; else delete process.env.LAB_BROWSER_REF; rmSync(dir, { recursive: true, force: true }); done(); }
});

test('after reload with a closed browser the chip and status still name the restart command', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-browser-ux-closed-')); const ref = join(dir, 'ref.json');
  writeFileSync(ref, JSON.stringify({ root: join(dir, 'gone'), session: 'lab-' + 'd'.repeat(24), origin: ORIGIN }), { mode: 0o600 });
  const saved = process.env.LAB_BROWSER_REF; process.env.LAB_BROWSER_REF = ref; const tools: any[] = [], entries: any[] = [], status: any[] = []; let command: any, start: any;
  try {
    installBrowserExtension({ on: (n: string, f: any) => { if (n === 'session_start') start = f; }, registerTool: (t: any) => tools.push(t), registerCommand: (_n: string, c: any) => { command = c; }, sendMessage() {}, appendEntry: (_t: string, d: any) => entries.push(d) } as any);
    const ctx = { ui: { notify() {}, setStatus: (_k: string, t: any) => status.push(t) } };
    expect(tools).toHaveLength(0); start({}, ctx); expect(status).toEqual(['○ web closed']);
    await command.handler('status', ctx); expect(entries[0].lines).toEqual(['○ browser closed. Start a new run: lab --browser http://127.0.0.1:53508/']);
  } finally { if (saved) process.env.LAB_BROWSER_REF = saved; else delete process.env.LAB_BROWSER_REF; rmSync(dir, { recursive: true, force: true }); }
});

test('closed chip names why: result unknown, connection lost, left origin, read failed; operator close says closed', () => {
  const at = (code: string, operation = 'click', cleanup: 'done' | 'retained' = 'done'): BrowserFailureInfo => ({ code, operation, phase: 'action', cleanup });
  const chipOf = (failure?: BrowserFailureInfo) => indicatorText(chip({ state: 'closed', origin: ORIGIN, ...(failure ? { failure } : {}) }));
  expect(chipOf(at('LAB_BROWSER_TIMEOUT'))).toBe('○ web closed · result unknown');
  expect(chipOf(at('LAB_BROWSER_CANCELLED', 'navigate'))).toBe('○ web closed · result unknown');
  expect(chipOf(at('LAB_BROWSER_TIMEOUT', 'snapshot'))).toBe('○ web closed · read failed');
  expect(chipOf(at('LAB_BROWSER_SESSION_LOST', 'snapshot'))).toBe('○ web closed · connection lost');
  expect(chipOf(at('LAB_BROWSER_SPAWN'))).toBe('○ web closed · connection lost');
  expect(chipOf(at('LAB_BROWSER_ORIGIN'))).toBe('○ web closed · left origin');
  expect(chipOf(at('LAB_BROWSER_NEW_TARGET'))).toBe('○ web closed · left origin');
  expect(chipOf()).toBe('○ web closed');
  expect(chipOf({ code: 'LAB_BROWSER_STALE_REF', phase: 'pre', cleanup: 'none' })).toBe('○ web closed');
  expect(closedReason(at('LAB_BROWSER_TIMEOUT', 'click', 'retained'))).toBeUndefined(); // cleanup-failed has its own chip
  // Persisted records are validated field by field; anything else is ignored.
  expect(failureRecord({ ...at('LAB_BROWSER_TIMEOUT'), ref: '@e5', extra: 1 })).toEqual({ code: 'LAB_BROWSER_TIMEOUT', operation: 'click', ref: '@e5', phase: 'action', cleanup: 'done' });
  for (const bad of [null, 'x', { ...at('LAB_BROWSER_TIMEOUT'), phase: 'pre' }, { ...at('EVIL'), }, { ...at('LAB_BROWSER_TIMEOUT'), operation: 'evil\u001b' }, { ...at('LAB_BROWSER_TIMEOUT'), ref: hostile }, { ...at('LAB_BROWSER_TIMEOUT'), cleanup: 'none' }])
    expect(failureRecord(bad)).toBeUndefined();
});

/** Pi 1.4.0 footer status line (dist footer.js): statuses sorted by key with localeCompare, sanitized, joined with ' ', truncateToWidth(width, '...'). */
function piFooter(statuses: Map<string, string>, width: number) {
  const line = [...statuses].sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t.replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim()).join(' ');
  if (Bun.stringWidth(line) <= width) return line;
  let out = ''; for (const ch of line) { if (Bun.stringWidth(out + ch) > width - 3) break; out += ch; } return out + '...';
}
test('footer: mode sorts first and is never cut; web chip is cut next, desktop first, at 40/80/120', () => {
  expect(Object.values(indicatorSlots).sort((a, b) => a.localeCompare(b))).toEqual([indicatorSlots.mode, indicatorSlots.web, indicatorSlots.desktop]);
  const longOrigin = 'http://' + 'x'.repeat(90) + hostile;
  const webStates: LifecycleView[] = [{ state: 'active', origin: ORIGIN, actions: 0 }, { state: 'active', origin: longOrigin, actions: 0 },
    { state: 'closed', origin: ORIGIN, failure: { code: 'LAB_BROWSER_TIMEOUT', operation: 'click', phase: 'action', cleanup: 'done' } },
    { state: 'closed', origin: ORIGIN, failure: { code: 'LAB_BROWSER_SESSION_LOST', operation: 'snapshot', phase: 'action', cleanup: 'done' } },
    { state: 'cleanup-failed', origin: ORIGIN }];
  // Longest mode text #26 sets (mode: <name> · /lab-mode); any mode text up to the width survives intact.
  for (const mode of ['mode: ask · /lab-mode', 'mode: read-only · /lab-mode']) for (const v of webStates) for (const width of widths) {
    const statuses = new Map<string, string>();
    const ui = { setStatus: (k: string, t: string | undefined) => { if (t === undefined) statuses.delete(k); else statuses.set(k, t); } };
    ui.setStatus(indicatorSlots.mode, mode); setIndicator(ui, indicatorSlots.web, chip(v)); setIndicator(ui, indicatorSlots.desktop, { glyph: '●', label: 'desktop', detail: 'Finder' });
    const line = piFooter(statuses, width);
    expect(Bun.stringWidth(line)).toBeLessThanOrEqual(width); expect(line).not.toMatch(controls);
    expect(line.startsWith(mode + ' ')).toBe(true); // mode is first and whole
    const web = indicatorText(chip(v));
    const full = [mode, web, indicatorText({ glyph: '●', label: 'desktop', detail: 'Finder' })].join(' ');
    if (Bun.stringWidth(full) <= width || Bun.stringWidth(mode + ' ' + web) <= width - 3) expect(line).toContain(web); // web whole until it no longer fits beside mode + '...'
    else expect(line).not.toContain('desktop'); // web cut means desktop already gone
  }
  // 40 columns, the documented worst case: mode whole, chip glyph + label still visible.
  const at40 = piFooter(new Map([[indicatorSlots.mode, 'mode: read-only · /lab-mode'], [indicatorSlots.web, indicatorText(chip(webStates[2]))]]), 40);
  expect(at40).toBe('mode: read-only · /lab-mode ○ web clo...');
});

test('after reload the closed chip and status still say why the browser closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-browser-ux-why-')); const ref = join(dir, 'browser-ref.json');
  writeFileSync(ref, JSON.stringify({ root: join(dir, 'gone'), session: 'lab-' + 'e'.repeat(24), origin: ORIGIN }), { mode: 0o600 });
  writeFileSync(join(dir, 'browser-ref.closed.json'), JSON.stringify({ code: 'LAB_BROWSER_SESSION_LOST', operation: 'snapshot', phase: 'action', cleanup: 'done' }), { mode: 0o600 });
  const saved = process.env.LAB_BROWSER_REF; process.env.LAB_BROWSER_REF = ref; const entries: any[] = [], status: any[] = []; let command: any, start: any;
  try {
    installBrowserExtension({ on: (n: string, f: any) => { if (n === 'session_start') start = f; }, registerTool() {}, registerCommand: (_n: string, c: any) => { command = c; }, sendMessage() {}, appendEntry: (_t: string, d: any) => entries.push(d) } as any);
    const ctx = { ui: { notify() {}, setStatus: (_k: string, t: any) => status.push(t) } };
    start({}, ctx); expect(status).toEqual(['○ web closed · connection lost']);
    await command.handler('status', ctx); expect(entries[0].lines[0]).toStartWith('○ Browser disconnected: the browser daemon exited or was replaced');
    writeFileSync(join(dir, 'browser-ref.closed.json'), '{"code":"\u001b[31m","phase":"action","cleanup":"done"}'); status.length = 0;
    installBrowserExtension({ on: (n: string, f: any) => { if (n === 'session_start') start = f; }, registerTool() {}, registerCommand() {}, sendMessage() {} } as any);
    start({}, ctx); expect(status).toEqual(['○ web closed']); // invalid record ignored
  } finally { if (saved) process.env.LAB_BROWSER_REF = saved; else delete process.env.LAB_BROWSER_REF; rmSync(dir, { recursive: true, force: true }); }
});

test('help Usage lists every option, the shell launcher matches it, and setup ends with Next', () => {
  const usage = shellUsage();
  for (const [option] of shellOptions) expect(usage).toContain('[' + option + ']');
  expect(shellHelp().split('\n')[1]).toBe(usage);
  expect(readFileSync(resolve(import.meta.dir, '../lab'), 'utf8')).toContain(`printf '${usage}\\n'`);
  const r = spawnSync('/bin/sh', [resolve(import.meta.dir, '../lab'), '--not-an-option'], { env: { PATH: '/usr/bin:/bin', HOME: tmpdir() }, encoding: 'utf8' });
  expect(r.status).toBe(1); expect(r.stderr.trim()).toBe(usage);
  for (const found of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', undefined]) {
    const lines = setupSummary('0.41.0', false, found).split('\n');
    expect(lines[0]).toBe('✓ agent-browser 0.41.0 verified · no browser downloaded'); expect(lines.at(-1)).toStartWith('Next:  lab --browser ');
    expect(lines[1]).toStartWith(found ? '✓ browser found: ' : '! no approved browser found');
  }
});

test('a dead daemon is reported as lost before any command can relaunch it', async () => {
  const { s, sent, done } = scripted({ daemonDead: true });
  try {
    const info = await failureOf(s.execute({ operation: 'snapshot' }));
    expect(info).toMatchObject({ code: 'LAB_BROWSER_SESSION_LOST', phase: 'action', cleanup: 'done' });
    expect(classify(info)).toBe('lost'); expect(recoveryText(info, ORIGIN)).toContain('daemon exited or was replaced');
    expect(sent).toEqual(['close']); // no browser command was sent to a replacement daemon
  } finally { done(); }
});

test('orphan reap signals only a live process proven to use the owned profile', async () => {
  const { reapOwnedBrowsers } = await import('../src/browser/session.ts');
  const { spawn } = await import('node:child_process'); const { symlinkSync } = await import('node:fs');
  const t = mkdtempSync(join(tmpdir(), 'lab-browser-reap-'));
  const fake = (dir: string) => spawn(process.execPath, ['-e', 'setTimeout(()=>{},30000)', '--user-data-dir=' + dir], { stdio: 'ignore' });
  const mine = join(t, 'agent-browser-chrome-a'), foreign = join(t, 'agent-browser-chrome-b'); mkdirSync(mine); mkdirSync(foreign);
  const a = fake(mine), b = fake(join(t, 'elsewhere'));
  try {
    await new Promise(r => setTimeout(r, 300));
    symlinkSync('host-' + a.pid, join(mine, 'SingletonLock'));
    symlinkSync('host-' + b.pid, join(foreign, 'SingletonLock')); // live pid whose profile is not this one
    expect(await reapOwnedBrowsers(t, ['agent-browser-chrome-a', 'agent-browser-chrome-b'])).toBe(false);
    expect(() => process.kill(b.pid!, 0)).not.toThrow(); expect(() => process.kill(a.pid!, 0)).not.toThrow(); // nothing signalled when any target is unproven
    expect(await reapOwnedBrowsers(t, ['agent-browser-chrome-a'])).toBe(true);
    expect(() => process.kill(a.pid!, 0)).toThrow();
    expect(await reapOwnedBrowsers(t, ['agent-browser-chrome-a', 'missing'])).toBe(true); // dead pid / no lock: nothing to do
  } finally { for (const c of [a, b]) try { process.kill(c.pid!, 'SIGKILL'); } catch {} rmSync(t, { recursive: true, force: true }); }
});
