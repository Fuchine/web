// One-shot: compute level_estimate for processed videos that don't have one.
// Idempotent — only touches rows where the level is still null.
// Run: pnpm --filter @fuchine/worker backfill:level

import { and, eq, isNull } from "drizzle-orm";
import { createDb, videos, wordExamples, type Database } from "@fuchine/db";
import { estimateVideoLevel } from "../pipeline";
import { env } from "../env";

async function main() {
  const db = createDb(env.databaseUrl) as Database;
  const pending = await db
    .select({ id: videos.id, title: videos.title })
    .from(videos)
    .where(and(eq(videos.status, "done"), isNull(videos.levelEstimate)));

  let updated = 0;
  for (const v of pending) {
    const words = await db
      .select({ wordEntryId: wordExamples.wordEntryId })
      .from(wordExamples)
      .where(eq(wordExamples.videoId, v.id));
    const level = await estimateVideoLevel(db, words.map((w) => w.wordEntryId));
    if (!level) continue;
    await db.update(videos).set({ levelEstimate: level }).where(eq(videos.id, v.id));
    updated++;
    console.log(`[backfill] ${level.padEnd(12)} ${v.title}`);
  }
  console.log(`[backfill] ${updated}/${pending.length} videos got a level estimate`);

  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed", err);
    process.exit(1);
  });
