/**
 * `lab --setup-desktop`: acquire/verify the pinned tool, then report the
 * non-prompting permission status and name WHO macOS would grant. Never runs
 * `permissions --request` or `--guide`, never opens System Settings, never
 * lists or touches any app or window.
 */
import { createHostRoot, OwnedHost, type Transport } from "./host.ts";
import { guardBrowserLifecycle } from "../browser/lifecycle.ts";
import { envelope, permissions, type PermissionState } from "./projection.ts";
import { grantSubject, responsibleApp, type ResponsibleApp } from "./responsible.ts";
import { desktopVersion, verifyDesktopRuntime } from "./runtime.ts";

export type PermissionReport = { accessibility: PermissionState; screenRecording: PermissionState; automation: PermissionState };

export async function checkPermissions(transport: Transport, signal?: AbortSignal): Promise<PermissionReport> {
  const { code, stdout } = await transport.run(["permissions"], { signal, timeoutMs: 15000 });
  const e = envelope(stdout, "permissions");
  if (!e.ok) throw new Error("LAB_DESKTOP_PERMISSIONS: agent-desktop could not read permissions (" + e.error.code + ").");
  if (code !== 0) throw new Error("LAB_DESKTOP_RESPONSE");
  return permissions(e.data);
}

const settingsPath = "System Settings › Privacy & Security › Accessibility (named Device Control and Data Access on macOS 27 and later)";

/** Plain-text lines shared by setup and the in-session denied path. */
export function accessibilityAdvice(app: ResponsibleApp | undefined): string[] {
  const { who, detail, reach, recommended } = grantSubject(app);
  if (!recommended) return [
    `Accessibility is off for ${who}.`,
    `  That is ${detail}. Do NOT grant it: that would let ${reach} control other apps.`,
    `  Instead, quit and start LAB from a terminal app (Terminal or iTerm2), then run  lab --setup-desktop  there.`,
    `  LAB never changes this setting and never shows the macOS prompt.`,
  ];
  return [
    `Accessibility is off for ${who}.`,
    `  ${detail}`,
    `  Turning it on lets ${reach} control other apps, not only LAB.`,
    `  To grant it yourself: ${settingsPath} → add ${who} → turn it on. Revoke it there when you are done.`,
    `  LAB never changes this setting and never shows the macOS prompt.`,
  ];
}

export function setupReport(report: PermissionReport, app: ResponsibleApp | undefined, cached: boolean): { lines: string[]; ready: boolean } {
  const { who, reach } = grantSubject(app);
  const lines = [`✓ agent-desktop ${desktopVersion} verified${cached ? " (cached)" : ""}`];
  const ready = report.accessibility === "granted";
  if (ready) lines.push(`✓ Accessibility: on for ${who}`, `  This lets ${reach} control other apps; LAB binds each session to one window you pick.`);
  else lines.push("✗ " + accessibilityAdvice(app)[0]!, ...accessibilityAdvice(app).slice(1));
  lines.push(report.screenRecording === "granted" ? "✓ Screen Recording: on (not used by LAB in this release)" : "– Screen Recording: off (optional; LAB does not take screenshots in this release)");
  lines.push(ready ? "Next: lab --desktop, then /lab-desktop attach to pick one window." : grantSubject(app).recommended ? "Next: grant it yourself, then run  lab --setup-desktop  again." : "Next: run  lab --setup-desktop  from Terminal or iTerm2.");
  return { lines, ready };
}

export type SetupResult = { lines: string[]; ready: boolean; report?: PermissionReport; app?: ResponsibleApp; signalled?: number };
/**
 * One owned root for the check; the host it starts is stopped and the root
 * removed before returning. The #23 signal guard covers the whole run: a
 * signal cancels the check, and cleanup still finishes before exit.
 */
export async function runDesktopSetup(cached: boolean, root?: string, transport?: Transport): Promise<SetupResult> {
  const runtime = transport ? undefined : verifyDesktopRuntime();
  const guard = guardBrowserLifecycle();
  let result: SetupResult | undefined, failure: unknown;
  try {
    const host = transport ?? new OwnedHost({ root: root ?? createHostRoot(), binary: runtime!.binary, helper: runtime!.helper });
    try {
      const report = await checkPermissions(host, guard.signal);
      const app = responsibleApp();
      result = { ...setupReport(report, app, cached), report, app };
    } catch (error) { failure = error; }
    guard.state.phase = "cleanup";
    await host.stopHosts(); host.remove();
  } finally { guard.release(); }
  if (guard.state.signalled) return { lines: ["Desktop setup cancelled; owned state cleaned up."], ready: false, signalled: guard.state.signalled };
  if (failure) throw failure;
  return result!;
}
