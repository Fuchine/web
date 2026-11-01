import { createRedis, getImportQueue, getMaintenanceQueue, refreshCoverageJobId } from "@fuchine/jobs";
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

let maintenance: ReturnType<typeof getMaintenanceQueue> | null = null;

/**
 * Ask the worker to re-materialize this user's Explore candidates (T3.10).
 * Fire-and-forget: the jobId collapses repeat visits, and a Redis blip only
 * means Explore keeps serving the previous (slightly stale) ranking.
 */
export function requestCoverageRefresh(userId: string): void {
  try {
    if (!maintenance) {
      maintenance = getMaintenanceQueue(createRedis(process.env.REDIS_URL ?? "redis://localhost:6379"));
    }
    void maintenance
      .add("refresh-coverage", { kind: "refresh-coverage", userId }, { jobId: refreshCoverageJobId(userId) })
      .catch((err) => console.error("[explore] coverage refresh enqueue failed", err));
  } catch (err) {
    console.error("[explore] coverage refresh enqueue failed", err);
  }
}
