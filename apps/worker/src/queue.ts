import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const IMPORT_QUEUE = "import";

/** One job per video import. `videoId` is the row already created by the API. */
export type ImportJob = { videoId: string };

// BullMQ requires maxRetriesPerRequest: null on the connection.
export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

// BullMQ accepts an ioredis instance; the cast bridges the bundled ioredis types.
export const bullConnection = connection as unknown as ConnectionOptions;

export const importQueue = new Queue<ImportJob>(IMPORT_QUEUE, {
  connection: bullConnection,
});
