// Worker entrypoint: consume the import queue and run the pipeline, then
// pre-warm layer-2 explanations on a separate queue (so hour-long pre-warm
// runs never block import slots).

import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { createDb, videos } from "@fuchine/db";
import { prewarmVideoExplanations, resolveMaxLines } from "@fuchine/llm";
import {
  getExplainQueue,
  getImportQueue,
  EXPLAIN_QUEUE,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL,
  type ExplainJob,
} from "@fuchine/jobs";
import { IMPORT_QUEUE, connection, bullConn, type ImportJob } from "./queue";
import { importVideo } from "./pipeline";
import { houseProvider, hasHouseLlm } from "./provider";
import { env } from "./env";

// The worker runs at concurrency 2 (import) + 1 (explain), so a small pool is
// plenty; keep it lean to leave connection budget for web. Overridable via
// DB_POOL_MAX for larger deploys.
const db = createDb(env.databaseUrl, { max: Number(process.env.DB_POOL_MAX) || 5 });
const explainQueue = getExplainQueue(connection);
const importQueue = getImportQueue(connection);

const importWorker = new Worker<ImportJob>(
  IMPORT_QUEUE,
  async (job) => {
    await importVideo(db, job.data);
    // Layer-2 pre-warm: the cache is shared (D3), so generating ahead is an
    // investment every future viewer inherits. English is the product default;
    // other explanation languages stay on the on-demand path.
    try {
      if (hasHouseLlm()) {
        await explainQueue.add("explain", {
          videoId: job.data.videoId,
          explanationLanguage: "en",
        });
      }
    } catch (err) {
      // Pre-warm is an optimization: a failed enqueue must never fail the
      // import that just succeeded.
      console.error(`[explain] enqueue failed for ${job.data.videoId}`, err);
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
      // `full` (first-open tail warm) covers the whole video; `head`/default
      // keeps the eager import cap. Cache-first, so the overlap re-checks but
      // never re-generates the head.
      maxLines: resolveMaxLines(job.data.scope, env.prewarmMaxLines),
    });
    console.log(
      `[explain] pre-warm ${job.data.videoId} (${job.data.scope ?? "head"}): ` +
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

// Liveness heartbeat: renew a short-TTL key so `/api/health` (and a compose
// healthcheck) can tell a live worker from a crashed one. Renew at a third of
// the TTL so a single missed tick doesn't read as dead.
async function beat() {
  try {
    await connection.set(WORKER_HEARTBEAT_KEY, Date.now(), "EX", WORKER_HEARTBEAT_TTL);
  } catch (err) {
    console.error("[worker] heartbeat failed", err);
  }
}
void beat();
const heartbeat = setInterval(() => void beat(), (WORKER_HEARTBEAT_TTL / 3) * 1000);

// Reconcile videos left in "processing" with no job in the queue — a worker
// killed mid-import (OOM/SIGKILL) can orphan one, and the library would show
// "Processing" forever. BullMQ's own stalled-job recovery covers the common
// case; this is the safety net for when the job is truly gone (e.g. Redis was
// flushed). Idempotent: the pipeline dedups, so a spurious re-enqueue is cheap.
async function reconcileStuckImports() {
  try {
    const stuck = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.status, "processing"));
    if (stuck.length === 0) return;
    const pending = await importQueue.getJobs([
      "waiting",
      "active",
      "delayed",
      "paused",
      "waiting-children",
    ]);
    const queued = new Set(
      pending.map((j) => j?.data?.videoId).filter((id): id is string => Boolean(id)),
    );
    let requeued = 0;
    for (const v of stuck) {
      if (!queued.has(v.id)) {
        await importQueue.add("import", { videoId: v.id });
        requeued++;
      }
    }
    if (requeued > 0) {
      console.log(
        `[reconcile] re-enqueued ${requeued} stuck import(s) of ${stuck.length} in "processing"`,
      );
    }
  } catch (err) {
    console.error("[reconcile] failed", err);
  }
}
void reconcileStuckImports();

console.log(`[worker] listening on "${IMPORT_QUEUE}" and "${EXPLAIN_QUEUE}" queues`);

async function shutdown() {
  clearInterval(heartbeat);
  await importWorker.close();
  await explainWorker.close();
  await explainQueue.close();
  await importQueue.close();
  await connection.del(WORKER_HEARTBEAT_KEY).catch(() => {});
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
