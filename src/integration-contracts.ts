/** Additive integration types. Terminal observations confer no task authority. */
export type SourceReference = {
  path: string;
  contentHash: string;
  lineStart: number;
  lineEnd: number;
  text: string;
};
export type SearchOptions = {
  engine?: "auto" | "fallback" | "rg";
  limit?: number;
  maxEntries?: number;
  maxFileBytes?: number;
};
export type SearchResult = {
  hits: SourceReference[];
  engine: "fallback" | "rg";
  truncated: boolean;
  omissions: { path: string; reason: string }[];
};
export type SkillCompatibility = "portable" | "local-dependency" | "connected-service" | "proprietary-unavailable";
export type SkillOrigin = { id: string; root: string };
export type HerdrSmokeOptions = { stateRoot: string; executable?: string; timeoutMs?: number };
export type TerminalObservation = {
  label: "actual-herdr-owned-process";
  session: string;
  sourcePin: string;
  observedOutput: string;
  stopped: boolean;
  taskAcceptance: "unchanged";
  [key: string]: unknown;
};
