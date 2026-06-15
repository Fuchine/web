import { createRedis, getImportQueue } from "@fuchine/jobs";

// Producer handle to the import queue. Placeholder URL keeps `next build` from
// connecting; real enqueues require REDIS_URL.
const redis = createRedis(process.env.REDIS_URL ?? "redis://localhost:6379");

export const importQueue = getImportQueue(redis);
