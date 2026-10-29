import type { AdmissionStatus, ClientProfile } from "./protocol.ts";
import { LabError } from "./util.ts";

/** Deliberately no CLI/config override: a fixture does not qualify a native seam. */
export function admission(): AdmissionStatus {
  return { nativePi: "blocked-unqualified", offlineFixture: "available", localRoute: "unverified", reasons: [
    "Native per-request rejection/cancellation across compaction and queued input is not qualified.",
    "Native model-switch/resume profile enforcement is not qualified.",
    "No operational platform/local route is configured. The separately recorded temporary local smoke does not activate LAB.",
  ] };
}
export function requireFixture(profile: ClientProfile): void {
  if (profile.mode !== "fixture") throw new LabError("NATIVE_PI_UNQUALIFIED");
}
