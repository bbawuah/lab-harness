/**
 * Process-signal guard for the owned browser's whole lifecycle. Herdr installs
 * its own handlers only while it runs; without this guard a signal during
 * browser startup or final cleanup would terminate LAB by default and orphan
 * the owned browser. Startup signals abort startup; signals during cleanup are
 * recorded and absorbed until the bounded owned cleanup has finished; while
 * Herdr runs, its handlers own signal routing.
 */
export type LifecyclePhase = "startup" | "herdr" | "cleanup";
export function guardBrowserLifecycle() {
  const controller = new AbortController();
  const state = { phase: "startup" as LifecyclePhase, signalled: 0 };
  const handlers = ([["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]] as const).map(([name, code]) =>
    [name, () => { if (state.phase === "herdr") return; state.signalled ||= code; controller.abort(); }] as const);
  for (const [name, handler] of handlers) process.on(name, handler);
  let released = false;
  return {
    signal: controller.signal, state,
    release() { if (released) return; released = true; for (const [name, handler] of handlers) process.off(name, handler); },
  };
}
