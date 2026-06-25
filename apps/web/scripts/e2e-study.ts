/**
 * End-to-end test for the study read-side (F1): library + player payload.
 *
 * Drives the REAL queries (`listVideos`, `getVideoWithLines`,
 * apps/web/lib/study.ts) against a live Postgres.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-study.ts
 */
import { eq } from "drizzle-orm";
import {
  createDb,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  type Database,
  type Token,
} from "@fuchine/db";
import { listVideos, getVideoWithLines } from "../lib/study";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

async function main() {
  console.log("\n=== E2E: study read-side ===\n");
  const stamp = Date.now();

  // Video A: two lines + one translated-chunk marker. (Created first → older.)
  const [vA] = await db
    .insert(videos)
    .values({ source: "youtube", sourceId: `e2e-study-a-${stamp}`, url: "https://youtu.be/a", title: "A", channel: "ch", language: "ja", status: "done" })
    .returning();
  const tokens: Token[] = [{ surface: "猫", lemma: "猫", reading: "ねこ", romaji: "neko", pos: "noun", wordEntryId: null }];
  await db.insert(subtitleLines).values([
    { videoId: vA.id, idx: 0, tStartMs: 0, tEndMs: 1000, textOriginal: "猫が好き", textTranslation: "I like cats", tokens },
    { videoId: vA.id, idx: 1, tStartMs: 1000, tEndMs: 2000, textOriginal: "犬も好き", textTranslation: null, tokens: [] },
  ]);
  await db.insert(subtitleTranslationChunks).values({ videoId: vA.id, chunkIdx: 0, status: "done" });

  // Video B: no lines (newer).
  const [vB] = await db
    .insert(videos)
    .values({ source: "youtube", sourceId: `e2e-study-b-${stamp}`, url: "https://youtu.be/b", title: "B", language: "ja", status: "pending" })
    .returning();

  // --- 1. Library listing ---
  console.log("1. listVideos");
  const list = await listVideos(db);
  const a = list.find((v) => v.id === vA.id);
  const b = list.find((v) => v.id === vB.id);
  check("both videos present", !!a && !!b);
  check("video A line count = 2", a?.lineCount === 2, a?.lineCount);
  check("empty video B line count = 0 (left join)", b?.lineCount === 0, b?.lineCount);
  const idxA = list.findIndex((v) => v.id === vA.id);
  const idxB = list.findIndex((v) => v.id === vB.id);
  check("newest first (B before A)", idxB < idxA, { idxA, idxB });

  // --- 2. Player payload ---
  console.log("2. getVideoWithLines");
  const payload = await getVideoWithLines(db, vA.id);
  check("returns the video", payload?.video.id === vA.id);
  check("lines ordered by idx", payload?.lines.length === 2 && payload.lines[0]!.idx === 0 && payload.lines[1]!.idx === 1, payload?.lines.map((l) => l.idx));
  check("carries tokens", ((payload?.lines[0]?.tokens as Token[]) ?? []).length === 1);
  check("carries translation (and null where absent)", payload?.lines[0]?.textTranslation === "I like cats" && payload?.lines[1]?.textTranslation === null);
  check("reports translated chunk markers", JSON.stringify(payload?.translatedChunks) === "[0]", payload?.translatedChunks);

  const empty = await getVideoWithLines(db, vB.id);
  check("empty video => no lines, no chunks", empty?.lines.length === 0 && empty?.translatedChunks.length === 0);

  const missing = await getVideoWithLines(db, "00000000-0000-0000-0000-000000000000");
  check("unknown video => null", missing === null);

  // --- Cleanup ---
  await db.delete(videos).where(eq(videos.id, vA.id)); // cascades lines + chunks
  await db.delete(videos).where(eq(videos.id, vB.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => {
  console.error("E2E crashed:", err);
  await closeDb();
  process.exit(1);
});
