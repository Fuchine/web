import { createRedis, getExplainQueue } from "@fuchine/jobs";

// Lazy explain-queue producer (mirrors lib/queue.ts): connect to Redis on first
// enqueue, never at build/import time.
let explainQueue: ReturnType<typeof getExplainQueue> | null = null;
function queue() {
  if (!explainQueue) {
    explainQueue = getExplainQueue(createRedis(process.env.REDIS_URL ?? "redis://localhost:6379"));
  }
  return explainQueue;
}

/**
 * Is a real house LLM configured? Mirrors the worker's guard
 * (apps/worker/src/provider.ts `hasHouseLlm`): with no real provider the value
 * is "echo", which would just fail/garbage every line — so don't pre-warm.
 */
export function hasHouseLlm(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.LLM_PROVIDER ?? "echo") !== "echo";
}

/**
 * On first player open, enqueue a full-video layer-2 pre-warm — the tail past
 * PREWARM_MAX_LINES that import intentionally skipped (backlog/prewarm-cost-per-import
 * item 2). Opening the player is a cheap audience signal that the tail is worth
 * generating ahead of the viewer.
 *
 * Idempotent and cheap: the `jobId` collapses concurrent/repeat opens, and
 * prewarm is cache-first, so a re-run after the tail is warm generates nothing.
 * Fire-and-forget — a Redis blip must never block or break the player payload.
 */
export function requestTailPrewarm(videoId: string, explanationLanguage = "en"): void {
  if (!hasHouseLlm()) return;
  void queue()
    .add(
      "explain",
      { videoId, explanationLanguage, scope: "full" as const },
      { jobId: `explain-full:${videoId}:${explanationLanguage}` },
    )
    .catch((err) => {
      console.error(`[explain] tail pre-warm enqueue failed for ${videoId}`, err);
    });
}
