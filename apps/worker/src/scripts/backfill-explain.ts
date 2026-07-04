// One-shot: enqueue an explain pre-warm job for every processed video.
// Idempotent — pre-warm skips lines already cached, so re-running is safe.
// Run: pnpm --filter @fuchine/worker backfill:explain

import { eq } from "drizzle-orm";
import { createDb, videos } from "@fuchine/db";
import { getExplainQueue } from "@fuchine/jobs";
import { connection } from "../queue";
import { env } from "../env";

async function main() {
  const db = createDb(env.databaseUrl);
  const done = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.status, "done"));

  const queue = getExplainQueue(connection);
  for (const v of done) {
    await queue.add("explain", { videoId: v.id, explanationLanguage: "en" });
  }
  console.log(`[backfill] enqueued ${done.length} explain pre-warm jobs`);

  await queue.close();
  await connection.quit();
}

void main();
