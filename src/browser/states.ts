/**
 * Operator-facing browser states (docs/browser-ux-contract.md). Pure: no I/O.
 * Wording keeps PR #23's rule: never retry blindly; after an uncertain action,
 * look at the page first. Restart commands use only the operator-chosen origin.
 */
export type BrowserOperation = 'snapshot' | 'navigate' | 'fill' | 'click' | 'read';
export type FailureState = 'stale' | 'refused' | 'closed' | 'uncertain' | 'breach' | 'lost' | 'cleanup-failed';
export type BrowserFailureInfo = { code: string; operation?: string; ref?: string; phase: 'pre' | 'action'; cleanup: 'none' | 'done' | 'retained'; staleKind?: 'stale' | 'unknown'; dispatched?: boolean };
export type LifecycleView =
  | { state: 'active'; origin: string; actions: number; last?: string }
  | { state: 'closed'; origin: string; failure?: BrowserFailureInfo }
  | { state: 'cleanup-failed'; origin: string; failure?: BrowserFailureInfo; detached?: true };

export const mutating = (op?: string) => op === 'fill' || op === 'click' || op === 'navigate';
export const codeOf = (message: string) => /^LAB_BROWSER_[A-Z_]+/.exec(message)?.[0] ?? 'LAB_BROWSER_REFUSED';
export const restartCommand = (origin: string) => `lab --browser ${origin}/`;

/** Action-phase failures always close the browser for this run; pre-dispatch refusals do not. */
export function classify(info: BrowserFailureInfo): FailureState {
  if (info.phase === 'pre') return info.code === 'LAB_BROWSER_STALE_REF' ? 'stale' : info.code === 'LAB_BROWSER_CLOSED' || info.code === 'LAB_BROWSER_FAILED' ? 'closed' : 'refused';
  if (info.cleanup === 'retained') return 'cleanup-failed';
  if (info.code === 'LAB_BROWSER_ORIGIN' || info.code === 'LAB_BROWSER_NEW_TARGET') return 'breach';
  if (info.code === 'LAB_BROWSER_SESSION_LOST' || info.code === 'LAB_BROWSER_SPAWN') return 'lost';
  return 'uncertain';
}

const action = (info: BrowserFailureInfo) => (info.operation ?? 'action') + (info.ref ? ' ' + info.ref : '');
const cause = (info: BrowserFailureInfo) => {
  const c = info.code;
  if (c === 'LAB_BROWSER_TIMEOUT') return 'timed out';
  if (c === 'LAB_BROWSER_CANCELLED') return 'was cancelled';
  if (c === 'LAB_BROWSER_DIAGNOSTIC') return 'printed diagnostics';
  if (c === 'LAB_BROWSER_OUTPUT_LIMIT') return 'returned too much output';
  return 'returned an unexpected response';
};

/** Recovery text sent to the model as part of the failed tool result and shown to the operator. */
export function recoveryText(info: BrowserFailureInfo, origin: string): string {
  const state = classify(info), restart = `Browser actions are off for this run. Start a new run: ${restartCommand(origin)}`;
  switch (state) {
    case 'stale': return info.staleKind === 'unknown'
      ? `${info.ref ?? 'ref'} was never issued. Nothing was sent to the page. Take a new snapshot and use its @eN refs.`
      : `${info.ref ?? 'ref'} is stale: refs reset after fill/click/navigate. Nothing was sent to the page. Take a new snapshot.`;
    case 'closed': return info.code === 'LAB_BROWSER_FAILED' && info.cleanup === 'retained'
      ? 'Browser stopped after an earlier failure; nothing was sent. Owned state kept: run /lab-browser close to retry cleanup.'
      : `Browser is closed for this run; nothing was sent. Start a new run: ${restartCommand(origin)}`;
    case 'refused': return 'Refused before anything was sent to the page' + (info.code === 'LAB_BROWSER_ORIGIN' ? `; stay on ${origin}.` : '; check the operation and arguments.');
    case 'breach': return info.dispatched === false
      ? `Browser closed: the page had left ${origin} or opened another tab before ${action(info)} was sent; ${action(info)} was not sent. ${restart}`
      : `Browser closed: the page left ${origin} or opened another tab after ${action(info)}. ${restart}`;
    case 'lost': return `Browser disconnected: the browser daemon exited or was replaced${info.dispatched === false ? ` before ${action(info)} was sent` : ''}; page state is unknown. ${restart}`;
    case 'cleanup-failed': return `Browser stopped after ${action(info)}; result unknown. Owned state kept: run /lab-browser close to retry cleanup.`;
    default: if (info.dispatched === false) return `Browser closed: a page check before ${action(info)} ${cause(info)}; ${action(info)} was not sent. ${restart}`;
      return mutating(info.operation)
      ? `Browser closed: ${action(info)} ${cause(info)}, result unknown. Check the page yourself before trying again. ${restart}`
      : `Browser closed: ${action(info)} ${cause(info)}; nothing was changed by this read. ${restart}`;
  }
}

/** Short reason a run's browser closed after a failed action, shown beside "closed". Undefined for an operator close. */
export function closedReason(failure?: BrowserFailureInfo): string | undefined {
  if (!failure || failure.phase !== 'action') return;
  const state = classify(failure);
  if (state === 'breach') return 'left origin';
  if (state === 'lost') return 'connection lost';
  if (state === 'uncertain') return failure.dispatched === false ? 'check failed' : mutating(failure.operation) ? 'result unknown' : 'read failed';
  return;
}
export type ChipState = { glyph: '●' | '○' | '!'; label: string; detail?: string };
export function chip(view: LifecycleView): ChipState {
  if (view.state === 'active') return { glyph: '●', label: 'web', detail: view.origin.replace(/^https?:\/\//, '') };
  if (view.state === 'cleanup-failed') return { glyph: '!', label: 'web', detail: view.detached ? 'not reattached · /exit cleans up' : 'cleanup · /lab-browser close' };
  const reason = closedReason(view.failure);
  return { glyph: '○', label: 'web', detail: 'closed' + (reason ? ' · ' + reason : '') };
}
const codes = /^LAB_BROWSER_[A-Z_]{1,40}$/, ops = /^(snapshot|navigate|fill|click|read)$/;
/** Persistable failure record (display only, never authorization). Returns undefined for anything not exactly this shape. */
export function failureRecord(value: unknown): BrowserFailureInfo | undefined {
  const v = value as any;
  if (!v || typeof v !== 'object' || typeof v.code !== 'string' || !codes.test(v.code)) return;
  if (v.phase !== 'action' || (v.cleanup !== 'done' && v.cleanup !== 'retained')) return;
  if (v.operation !== undefined && (typeof v.operation !== 'string' || !ops.test(v.operation))) return;
  if (v.ref !== undefined && (typeof v.ref !== 'string' || !/^@e\d{1,6}$/.test(v.ref))) return;
  if (v.dispatched !== undefined && typeof v.dispatched !== 'boolean') return;
  return { code: v.code, phase: 'action', cleanup: v.cleanup, ...(v.operation ? { operation: v.operation } : {}), ...(v.ref ? { ref: v.ref } : {}), ...(typeof v.dispatched === 'boolean' ? { dispatched: v.dispatched } : {}) };
}

export function statusLines(view: LifecycleView): string[] {
  if (view.state === 'active') return [
    `● browser ${view.origin} only · private profile`,
    `  ${view.actions} action${view.actions === 1 ? '' : 's'}${view.last ? ' · last: ' + view.last : ''} · /lab-browser close`,
  ];
  if (view.state === 'cleanup-failed' && view.detached) return ['! Browser could not be reattached after reload; browser actions are off. Owned state is kept until LAB exits (/exit), which cleans it up.'];
  if (view.state === 'cleanup-failed') return ['! ' + (view.failure ? recoveryText({ ...view.failure, cleanup: 'retained' }, view.origin) : 'Browser cleanup failed. Owned state kept: run /lab-browser close to retry cleanup.')];
  if (view.failure && view.failure.phase === 'action') return ['○ ' + recoveryText(view.failure, view.origin)];
  return [`○ browser closed. Start a new run: ${restartCommand(view.origin)}`];
}

/** Turn verdict from lab_browser tool results only (never model text). */
export type ToolOutcome = { isError: boolean; details?: any };
export function verdict(outcomes: ToolOutcome[]): string | undefined {
  if (!outcomes.length) return;
  const counts = new Map<string, number>(); let failed = 0, refused = 0, pending = false, verifiedAfterChange = false; const reasons = new Set<string>();
  for (const o of outcomes) {
    const d = o.details && typeof o.details === 'object' ? o.details : {};
    const op = typeof d.operation === 'string' && /^(snapshot|navigate|fill|click|read)$/.test(d.operation) ? d.operation : undefined;
    if (o.isError) {
      const st = typeof d.state === 'string' ? d.state : undefined;
      if (st === 'stale' || st === 'refused' || st === 'closed' || !st) refused++;
      else { failed++; reasons.add(st === 'breach' ? 'left origin' : st === 'lost' ? 'disconnected' : st === 'cleanup-failed' ? 'cleanup pending' : d.dispatched === false ? 'not sent' : mutating(op) ? 'result unknown' : 'read failed'); }
      continue;
    }
    if (!op) continue;
    counts.set(op, (counts.get(op) ?? 0) + 1);
    if (mutating(op)) pending = true; else if (pending) { pending = false; verifiedAfterChange = true; }
  }
  const parts = ['snapshot', 'navigate', 'fill', 'click', 'read'].filter(k => counts.get(k)).map(k => `${counts.get(k)} ${k}`);
  if (refused) parts.push(`${refused} refused`);
  if (failed) return `✗ browser: ${failed} failed (${[...reasons].join(', ')})${parts.length ? ' · ' + parts.join(' · ') : ''} · browser closed`;
  if (pending) return `! browser: page changed, not read back · ${parts.join(' · ')}`;
  if (!counts.size) return `! browser: nothing sent · ${parts.join(' · ')}`;
  return `✓ browser: ${parts.join(' · ')}${verifiedAfterChange ? ' · read back after change' : ''}`;
}
