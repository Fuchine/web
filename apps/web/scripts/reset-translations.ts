/**
 * List videos, or wipe a video's layer-1 translation cache so the player
 * re-runs translation live (useful when switching the house provider, e.g. to
 * DeepL). Clears the chunk markers AND nulls text_translation for the video.
 *
 *   # list videos (id, title, status, #lines):
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/reset-translations.ts
 *   # reset one video (or "all"):
 *   ... tsx scripts/reset-translations.ts <videoId|all>
 */
import { eq, sql } from "drizzle-orm";
import {
  createDb,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  type Database,
} from "@fuchine/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;
const arg = process.argv[2];

async function list() {
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      lines: sql<number>`count(${subtitleLines.id})`,
    })
    .from(videos)
    .leftJoin(subtitleLines, eq(subtitleLines.videoId, videos.id))
    .groupBy(videos.id);

  if (rows.length === 0) {
    console.log("No videos. Import one first (extension → /api/import).");
    return;
  }
  console.log("\nvideos:");
  for (const r of rows) {
    console.log(`  ${r.id}  [${r.status}]  ${r.lines} lines  — ${r.title}`);
  }
  console.log("\nReset one with:  tsx scripts/reset-translations.ts <id|all>\n");
}

async function reset(videoId: string) {
  const whereLines = videoId === "all" ? undefined : eq(subtitleLines.videoId, videoId);
  const whereChunks =
    videoId === "all" ? undefined : eq(subtitleTranslationChunks.videoId, videoId);

  await db.update(subtitleLines).set({ textTranslation: null }).where(whereLines);
  await db.delete(subtitleTranslationChunks).where(whereChunks);
  console.log(`Reset translation cache for ${videoId === "all" ? "ALL videos" : videoId}.`);
  console.log("Reopen the video in the player — translations will regenerate live.");
}

async function main() {
  if (!arg) await list();
  else await reset(arg);
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch((err) => {
  console.error("crashed:", err);
  process.exit(1);
});
