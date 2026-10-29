/** Frozen concept wire protocol v1. Native APIs are adapted, never renamed implicitly. */
export const PROTOCOL_VERSION = 1 as const;
export type Candidate = { candidateSHA: string; dirtyHash: string };
export type Requirement = { id: string; text: string };
export type ClientProfile = { id: string; alias: string; capabilityRevision: string; mode: "fixture" | "verified-local" };
export type ContextPack = Candidate & { schemaVersion: 1; requirements: Requirement[]; corrections: string[]; snippets: { path: string; contentHash: string; text: string }[]; skills: { id: string; contentHash: string }[] };
export type TaskContract = Candidate & { schemaVersion: 1; taskId: string; contractRevision: number; workspaceId: string; objective: string; requirements: Requirement[]; contextHash: string; profile: ClientProfile };
export type Claim = { taskId: string; contractRevision: number; attemptId: string; attemptGeneration: number; claimToken: string; workerSessionId: string; adapterInstanceId: string; grantTaskVersion: number };
export type ContextBinding = Candidate & { contextHash: string; claim: Claim; piSessionId: string; baseLeafEntryId: string; profileHash: string };
export type Evidence = Candidate & { requirementId: string; kind: "fixture" | "inspection"; artifactHash: string; description: string };
export type Result = Candidate & { resultId: string; contextBindingHash: string; requirements: { id: string; status: "pass" | "failed" | "unproven"; evidence: Evidence[] }[]; summary: string };
export type WorkerPayload = { kind: "started" } | { kind: "settled"; aborted: boolean; failed: boolean } | { kind: "result"; result: Result };
export type Callback = { schemaVersion: 1; eventId: string; claim: Claim; transitionExpectedVersion: number; payloadHash: string; payload: WorkerPayload };
export type TaskState = "ready" | "running" | "result_available" | "accepted" | "outcome_unknown";
export type AttemptOutcome = "pending" | "running" | "settled" | "aborted" | "failed" | "cancellation_requested" | "outcome_unknown";
export type TaskView = { contract: TaskContract; version: number; generation: number; state: TaskState; outcome: AttemptOutcome; claim: Claim | null; bindingHash: string | null; result: Result | null; acceptance: { reason: string; at: number; waived: string[] } | null };
export type Delivery = { busId: string; namespace: string; recipient: string; messageId: string; body: string };
export type ReceiveBinding = { busId: string; namespace: string; peerId: string };
export type IngestDisposition = { status: "processed" | "duplicate" | "quarantined"; detail: string };
export interface BoundMailbox {
  readonly binding: ReceiveBinding;
  inbox(): Delivery[];
  ack(ids: string[]): number;
}
export type AdmissionStatus = { nativePi: "blocked-unqualified"; offlineFixture: "available"; reasons: string[]; localRoute: "unverified" | "verified" };
