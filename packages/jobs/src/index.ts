// Shared queue contract between the web app (producer) and the worker
// (consumer), so the queue name and job shape live in one place.

import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

export type RedisConnection = Redis;

export const IMPORT_QUEUE = "import";

/** Enqueued when a video needs the import pipeline (layers 0 and 1). */
export type ImportJob = { videoId: string };

/** Redis connection configured the way BullMQ requires. */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Redis for request-path use (rate limiting), tuned to fail fast instead of
 * queueing: if Redis is unreachable, commands reject quickly so the caller can
 * fail open rather than hang the HTTP request. Do NOT use for BullMQ.
 */
export function createRequestRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 500,
    lazyConnect: true,
  });
}

/** Bridge an ioredis instance to BullMQ's connection type. */
export function bullConnection(redis: Redis): ConnectionOptions {
  return redis as unknown as ConnectionOptions;
}

/** Producer-side handle to the import queue. */
export function getImportQueue(redis: Redis): Queue<ImportJob> {
  return new Queue<ImportJob>(IMPORT_QUEUE, { connection: bullConnection(redis) });
}

export const EXPLAIN_QUEUE = "explain";

/** Enqueued after import: pre-generate layer-2 explanations for a video. */
export type ExplainJob = { videoId: string; explanationLanguage: string };

/** Producer-side handle to the explain pre-warm queue. */
export function getExplainQueue(redis: Redis): Queue<ExplainJob> {
  return new Queue<ExplainJob>(EXPLAIN_QUEUE, { connection: bullConnection(redis) });
}
