// DB-backed usage sink: persist each LLM call into `llm_usage`. Registered at
// process startup by web (instrumentation) and worker. Fire-and-forget — usage
// accounting is telemetry and must never fail or delay the request that
// generated it. Keeps the JSON log line too, so log-based observability survives.

import { llmUsage, type Database } from "@fuchine/db";
import type { UsageRecord, UsageSink } from "./usage";

export function dbUsageSink(db: Database): UsageSink {
  return (r: UsageRecord) => {
    console.log(JSON.stringify({ type: "llm_usage", ...r }));
    void db
      .insert(llmUsage)
      .values({
        userId: r.userId ?? null,
        videoId: r.videoId ?? null,
        lineId: r.lineId ?? null,
        fn: r.fn,
        provider: r.provider,
        model: r.model ?? null,
        inTokens: r.inTokens ?? null,
        outTokens: r.outTokens ?? null,
        ms: r.ms,
        ok: r.ok,
      })
      .catch((err: unknown) => {
        console.error("[llm_usage] insert failed", err);
      });
  };
}
