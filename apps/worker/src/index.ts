// Worker entrypoint: consume the import queue and run the pipeline.

import { Worker } from "bullmq";
import { createDb } from "@fuchine/db";
import {
  IMPORT_QUEUE,
  connection,
  bullConnection,
  type ImportJob,
} from "./queue";
import { importVideo } from "./pipeline";
import { env } from "./env";

const db = createDb(env.databaseUrl);

const worker = new Worker<ImportJob>(
  IMPORT_QUEUE,
  async (job) => {
    await importVideo(db, job.data);
  },
  { connection: bullConnection, concurrency: 2 },
);

worker.on("completed", (job) => {
  console.log(`[import] done: ${job.data.videoId}`);
});

worker.on("failed", (job, err) => {
  console.error(`[import] failed: ${job?.data.videoId}`, err);
});

console.log(`[worker] listening on "${IMPORT_QUEUE}" queue`);

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
