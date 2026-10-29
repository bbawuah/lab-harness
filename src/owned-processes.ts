/** Cleanup for direct children owned by the optional local smoke, not a LAB worker runner. */
import { requireThat } from "./util.ts";

type Child = Pick<ReturnType<typeof Bun.spawn>, "pid" | "kill" | "exited" | "exitCode">;
export class OwnedProcesses {
  private readonly children: Child[] = [];
  private stopping: Promise<void> | undefined;
  private readonly handlers: { signal: "SIGTERM" | "SIGINT"; handler: () => void }[] = [];
  adopt<T extends Child>(child: T): T {
    if (this.stopping) { child.kill("SIGKILL"); throw new Error("OWNED_PROCESS_SCOPE_STOPPING"); }
    this.children.push(child); return child;
  }
  async stop(): Promise<void> {
    return this.stopping ??= (async () => {
      for (const child of this.children) if (child.exitCode === null) child.kill("SIGTERM");
      const force = setTimeout(() => { for (const child of this.children) if (child.exitCode === null) child.kill("SIGKILL"); }, 1000);
      try { await Promise.all(this.children.map(child => child.exited)); } finally { clearTimeout(force); }
    })();
  }
  onSignals(afterStop: (signal: string) => void): void {
    requireThat(this.handlers.length === 0, "SIGNALS_ALREADY_REGISTERED");
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      let handling = false;
      const handler = () => { if (handling) return; handling = true; void this.stop().then(() => { afterStop(signal); process.exit(signal === "SIGTERM" ? 143 : 130); }); };
      process.on(signal, handler); this.handlers.push({ signal, handler });
    }
  }
  dispose(): void { for (const { signal, handler } of this.handlers) process.off(signal, handler); this.handlers.length = 0; }
}
