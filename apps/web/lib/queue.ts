import {
  createRedis,
  getImportQueue,
  getExplainQueue,
  fullPrewarmJobId,
} from "@fuchine/jobs";
import type { ImportEnqueuer } from "./import";

// Lazy so `next build` (and any import-time evaluation) never opens a Redis
// connection — it connects on first enqueue, at request time.
let queue: ReturnType<typeof getImportQueue> | null = null;
let explainQueue: ReturnType<typeof getExplainQueue> | null = null;

function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

export function getQueue(): ImportEnqueuer {
  if (!queue) {
    queue = getImportQueue(createRedis(redisUrl()));
  }
  return queue;
}

function getExplain(): ReturnType<typeof getExplainQueue> {
  if (!explainQueue) {
    explainQueue = getExplainQueue(createRedis(redisUrl()));
  }
  return explainQueue;
}

/**
 * First-open signal: warm the rest of the video's layer-2 explanations in the
 * background (import only warms the head — see backlog/prewarm-cost-per-import).
 * Deferring the tail until a video actually shows audience keeps the per-import
 * LLM cost bounded.
 *
 * Idempotent and cheap to over-call: a stable jobId dedups repeat opens, and the
 * completed job is kept a day so re-opens within the window don't even re-check
 * the cache. Fail-open — a queue hiccup must never fault the player payload.
 */
export async function enqueueFullPrewarm(
  videoId: string,
  explanationLanguage = "en",
): Promise<void> {
  try {
    await getExplain().add(
      "explain",
      { videoId, explanationLanguage, scope: "full" },
      {
        jobId: fullPrewarmJobId(videoId, explanationLanguage),
        // Keep the completed job a day so repeat opens dedup to a true no-op;
        // after that a re-open re-enqueues at most once, and it's cache-first.
        removeOnComplete: { age: 24 * 60 * 60 },
      },
    );
  } catch (err) {
    console.error(`[explain] full pre-warm enqueue failed for ${videoId}`, err);
  }
}
