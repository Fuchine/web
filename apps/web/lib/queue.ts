import { createRedis, getImportQueue } from "@fuchine/jobs";
import type { ImportEnqueuer } from "./import";

// Lazy so `next build` (and any import-time evaluation) never opens a Redis
// connection — it connects on first enqueue, at request time.
let queue: ReturnType<typeof getImportQueue> | null = null;

export function getQueue(): ImportEnqueuer {
  if (!queue) {
    queue = getImportQueue(createRedis(process.env.REDIS_URL ?? "redis://localhost:6379"));
  }
  return queue;
}
