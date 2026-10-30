/**
 * End-to-end test for per-video comprehension (F2). Runs the REAL
 * getComprehensionByVideo against a live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-comprehension.ts
 */
import {
  createDb, users, videos, subtitleLines, wordEntries, wordExamples, userWordStats,
  type Database, type Definition,
} from "@fuchine/db";
import { and, eq, inArray } from "drizzle-orm";
import { getComprehensionByVideo, getWordStatuses } from "../lib/study";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

async function main() {
  console.log("\n=== E2E: comprehension ===\n");

  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `e2e-comp-${stamp}@example.com` }).returning();
  const def: Definition[] = [{ glosses: ["x"], partsOfSpeech: ["n"] }];

  // 12 distinct dictionary words (≥ the 10-word floor).
  const words = await db.insert(wordEntries).values(
    Array.from({ length: 12 }, (_, i) => ({
      language: "ja", lemma: `語${stamp}-${i}`, reading: `r${i}`, pos: "noun", definitions: def,
    })),
  ).returning();

  const [video] = await db.insert(videos).values({
    sourceId: `e2e-comp-${stamp}`, url: "https://youtube.com/watch?v=e2e", title: "E2E comprehension",
  }).returning();
  const [tinyVideo] = await db.insert(videos).values({
    sourceId: `e2e-comp-tiny-${stamp}`, url: "https://youtube.com/watch?v=e2e2", title: "E2E tiny",
  }).returning();

  const [line] = await db.insert(subtitleLines).values({
    videoId: video.id, idx: 0, tStartMs: 0, tEndMs: 1000, textOriginal: "x",
  }).returning();
  const [tinyLine] = await db.insert(subtitleLines).values({
    videoId: tinyVideo.id, idx: 0, tStartMs: 0, tEndMs: 1000, textOriginal: "x",
  }).returning();

  // Main video references all 12 words; tiny video only 2 (below the floor).
  await db.insert(wordExamples).values(words.map((w) => ({
    wordEntryId: w.id, subtitleLineId: line.id, videoId: video.id,
  })));
  await db.insert(wordExamples).values(words.slice(0, 2).map((w) => ({
    wordEntryId: w.id, subtitleLineId: tinyLine.id, videoId: tinyVideo.id,
  })));

  let map = await getComprehensionByVideo(db, user.id);
  check("0% before any study", map.get(video.id) === 0, map.get(video.id));
  check("tiny video is omitted (too few words)", !map.has(tinyVideo.id));

  // User "knows" 6 of 12: 3 via a correct review, 3 via repeated views.
  await db.insert(userWordStats).values([
    ...words.slice(0, 3).map((w) => ({ userId: user.id, wordEntryId: w.id, reviewsOk: 1, reviewsTotal: 1 })),
    ...words.slice(3, 6).map((w) => ({ userId: user.id, wordEntryId: w.id, views: 5 })),
    // Weak signal only — must NOT count as known:
    { userId: user.id, wordEntryId: words[6].id, views: 4 },
    { userId: user.id, wordEntryId: words[7].id, reviewsTotal: 2, reviewsOk: 0 },
    { userId: user.id, wordEntryId: words[8].id, clicks: 1 },
  ]);

  map = await getComprehensionByVideo(db, user.id);
  check("6 of 12 known → 50%", map.get(video.id) === 50, map.get(video.id));

  // Player known-word signals (T3.8): same heuristic, per word.
  const ids = words.map((w) => w.id);
  const statuses = await getWordStatuses(db, user.id, [...ids, ids[0]]);
  const knownIds = Object.keys(statuses).filter((k) => statuses[k] === "known");
  check("statuses: the 6 comprehension-known words are known", knownIds.length === 6 &&
    words.slice(0, 6).every((w) => statuses[w.id] === "known"), statuses);
  check("statuses: views<5 and a click → seen", statuses[words[6].id] === "seen" && statuses[words[8].id] === "seen", statuses);
  check("statuses: failed reviews only, no views → omitted (unknown)", !(words[7].id in statuses), statuses);
  check("statuses: untouched words omitted (unknown)", !(words[11].id in statuses), statuses);
  check("statuses: empty id list → {}", Object.keys(await getWordStatuses(db, user.id, [])).length === 0);

  const [stranger] = await db.insert(users).values({ email: `e2e-comp-stranger-${stamp}@example.com` }).returning();
  const strangerMap = await getComprehensionByVideo(db, stranger.id);
  check("comprehension is per-user (stranger sees 0%)", strangerMap.get(video.id) === 0, strangerMap.get(video.id));
  const strangerStatuses = await getWordStatuses(db, stranger.id, ids);
  check("statuses are per-user (stranger has none)", Object.keys(strangerStatuses).length === 0, strangerStatuses);

  // A correct review flips a seen word to known (the coloring changes after a review).
  await db.update(userWordStats).set({ reviewsOk: 1, reviewsTotal: 1 })
    .where(and(eq(userWordStats.userId, user.id), eq(userWordStats.wordEntryId, words[6].id)));
  const after = await getWordStatuses(db, user.id, [words[6].id]);
  check("statuses: seen → known after a correct review", after[words[6].id] === "known", after);

  // Cleanup.
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(users).where(eq(users.id, stranger.id));
  await db.delete(videos).where(eq(videos.id, video.id));
  await db.delete(videos).where(eq(videos.id, tinyVideo.id));
  await db.delete(wordEntries).where(inArray(wordEntries.id, words.map((w) => w.id)));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => { console.error("E2E crashed:", err); await closeDb(); process.exit(1); });
