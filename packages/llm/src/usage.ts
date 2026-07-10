// Structured usage logging for LLM provider calls (backlog: llm-usage-metering).
// Emits one JSON line per call with tokens/chars + latency, never the key or
// content (CONTRATO §6.3). Consumed by the worker summary and future cost
// dashboards. No schema change — just observability.

export type UsageContext = {
  fn: "explainLine" | "translateBatch" | "translateOne";
  provider: string;
  model?: string;
  videoId?: string;
  lineId?: string;
};

export type UsageMetrics = {
  inTokens?: number;
  outTokens?: number;
  chars?: number;
  ms: number;
  ok: boolean;
};

export function logLlmUsage(ctx: UsageContext, metrics: UsageMetrics): void {
  console.log(
    JSON.stringify({
      type: "llm_usage",
      ...ctx,
      ...metrics,
      ts: new Date().toISOString(),
    }),
  );
}