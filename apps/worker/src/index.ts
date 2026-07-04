// Worker entrypoint: consume the import queue and run the pipeline, then
// pre-warm layer-2 explanations on a separate queue (so hour-long pre-warm
// runs never block import slots).

import { Worker } from "bullmq";
import { createDb } from "@fuchine/db";
import { prewarmVideoExplanations } from "@fuchine/llm";
import { getExplainQueue, EXPLAIN_QUEUE, type ExplainJob } from "@fuchine/jobs";
import { IMPORT_QUEUE, connection, bullConn, type ImportJob } from "./queue";
import { importVideo } from "./pipeline";
import { houseProvider, hasHouseLlm } from "./provider";
import { env } from "./env";

const db = createDb(env.databaseUrl);
const explainQueue = getExplainQueue(connection);

const importWorker = new Worker<ImportJob>(
  IMPORT_QUEUE,
  async (job) => {
    await importVideo(db, job.data);
    // Layer-2 pre-warm: the cache is shared (D3), so generating ahead is an
    // investment every future viewer inherits. English is the product default;
    // other explanation languages stay on the on-demand path.
    if (hasHouseLlm()) {
      await explainQueue.add("explain", {
        videoId: job.data.videoId,
        explanationLanguage: "en",
      });
    }
  },
  { connection: bullConn, concurrency: 2 },
);

const explainWorker = new Worker<ExplainJob>(
  EXPLAIN_QUEUE,
  async (job) => {
    const summary = await prewarmVideoExplanations(db, houseProvider(), job.data.videoId, {
      explanationLanguage: job.data.explanationLanguage,
      concurrency: 2,
    });
    console.log(
      `[explain] pre-warm ${job.data.videoId}: ` +
        `${summary.generated} generated, ${summary.cached} cached, ` +
        `${summary.failed} failed of ${summary.total}`,
    );
  },
  // One video at a time; prewarm's internal pool already runs 2 calls in
  // flight, and the free-tier provider throttles beyond that.
  { connection: bullConn, concurrency: 1 },
);

importWorker.on("completed", (job) => {
  console.log(`[import] done: ${job.data.videoId}`);
});
importWorker.on("failed", (job, err) => {
  console.error(`[import] failed: ${job?.data.videoId}`, err);
});
explainWorker.on("failed", (job, err) => {
  console.error(`[explain] failed: ${job?.data.videoId}`, err);
});

console.log(`[worker] listening on "${IMPORT_QUEUE}" and "${EXPLAIN_QUEUE}" queues`);

async function shutdown() {
  await importWorker.close();
  await explainWorker.close();
  await explainQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
