// One-shot: build video_word_counts (T3.9) for processed videos imported
// before 0021. Idempotent — by default only videos without any rows; `--all`
// rebuilds every done video (e.g. after changing the coverage exclusions).
// Run: pnpm --filter @fuchine/worker backfill:word-counts [--all]

import { asc, eq, sql } from "drizzle-orm";
import { createDb, subtitleLines, videos, videoWordCounts, type Database } from "@fuchine/db";
import { writeVideoWordCounts } from "../word-counts";
import { env } from "../env";

async function main() {
  const all = process.argv.includes("--all");
  const db = createDb(env.databaseUrl) as Database;
  const pending = await db
    .select({ id: videos.id, title: videos.title, language: videos.language })
    .from(videos)
    .where(
      all
        ? eq(videos.status, "done")
        : sql`${videos.status} = 'done' and not exists (select 1 from ${videoWordCounts} where ${videoWordCounts.videoId} = ${videos.id})`,
    );

  let built = 0;
  for (const v of pending) {
    const lines = await db
      .select({ tokens: subtitleLines.tokens })
      .from(subtitleLines)
      .where(eq(subtitleLines.videoId, v.id))
      .orderBy(asc(subtitleLines.idx));
    const words = await db.transaction((tx) =>
      writeVideoWordCounts(tx, v.id, v.language, lines.map((l) => l.tokens ?? [])),
    );
    built++;
    console.log(`[backfill] ${String(words).padStart(5)} words  ${v.title}`);
  }
  console.log(`[backfill] word counts built for ${built}/${pending.length} videos`);

  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed", err);
    process.exit(1);
  });
