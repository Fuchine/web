// Per-request usage accounting for LLM provider calls (backlog: llm-usage-metering).
// Records tokens/latency + attribution (user/video/line), never the key or
// content (CONTRATO §6.3). Dispatched to a pluggable sink: the default just logs
// one JSON line per call (dev/observability); web and worker register a
// DB-backed sink (dbUsageSink) at startup to persist into `llm_usage`.

export type UsageFn = "explainLine" | "translateBatch" | "translateOne";

/** Attribution threaded from the call site down to the chat call. All optional:
 * house/background calls (prewarm) have no user, some calls have no video. */
export type UsageMeta = {
  userId?: string;
  videoId?: string;
  lineId?: string;
};

export type UsageContext = UsageMeta & {
  fn: UsageFn;
  provider: string;
  model?: string;
};

export type UsageMetrics = {
  inTokens?: number;
  outTokens?: number;
  chars?: number;
  ms: number;
  ok: boolean;
};

export type UsageRecord = UsageContext & UsageMetrics & { ts: string };

export type UsageSink = (record: UsageRecord) => void;

const consoleSink: UsageSink = (record) => {
  console.log(JSON.stringify({ type: "llm_usage", ...record }));
};

let sink: UsageSink = consoleSink;

/** Register where usage records go. Called once at process startup (web/worker). */
export function setUsageSink(next: UsageSink): void {
  sink = next;
}

export function logLlmUsage(ctx: UsageContext, metrics: UsageMetrics): void {
  sink({ ...ctx, ...metrics, ts: new Date().toISOString() });
}
