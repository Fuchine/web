/**
 * End-to-end test for study-activity writers (watch time, word stats). Runs the
 * REAL lib functions (recordProgress / recordWordClick + the mine/review bumps)
 * against a live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-progress.ts
 */
import {
  createDb, users, videos, subtitleLines, wordEntries, userDailyStats, userWordStats,
  type Database, type Definition, type Token,
} from "@fuchine/db";
import { and, eq } from "drizzle-orm";
import { recordProgress, recordWordClick } from "../lib/progress";
import { mineSentence, reviewCardById } from "../lib/cards";

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

const tok = (surface: string, wordEntryId: string | null): Token =>
  ({ surface, lemma: surface, reading: null, romaji: null, pos: "noun", wordEntryId });

async function main() {
  console.log("\n=== E2E: study-activity writers ===\n");

  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `e2e-progress-${stamp}@example.com` }).returning();
  const def: Definition[] = [{ glosses: ["x"], partsOfSpeech: ["n"] }];
  const [w1] = await db.insert(wordEntries).values({ language: "ja", lemma: `語A${stamp}`, reading: "a", pos: "noun", definitions: def }).returning();
  const [w2] = await db.insert(wordEntries).values({ language: "ja", lemma: `語B${stamp}`, reading: "b", pos: "noun", definitions: def }).returning();

  const [video] = await db.insert(videos).values({ sourceId: `e2e-progress-${stamp}`, url: "https://youtube.com/watch?v=e2e", title: "E2E progress" }).returning();
  const [otherVideo] = await db.insert(videos).values({ sourceId: `e2e-progress-other-${stamp}`, url: "https://youtube.com/watch?v=e2e2", title: "E2E other" }).returning();

  const [line1] = await db.insert(subtitleLines).values({
    videoId: video.id, idx: 0, tStartMs: 0, tEndMs: 2000, textOriginal: "AAB",
    tokens: [tok("A", w1.id), tok("A", w1.id), tok("B", w2.id)],
  }).returning();
  const [line2] = await db.insert(subtitleLines).values({
    videoId: video.id, idx: 1, tStartMs: 2000, tEndMs: 4000, textOriginal: "B",
    tokens: [tok("B", w2.id), tok("?", null)],
  }).returning();
  const [foreignLine] = await db.insert(subtitleLines).values({
    videoId: otherVideo.id, idx: 0, tStartMs: 0, tEndMs: 2000, textOriginal: "X",
    tokens: [tok("A", w1.id)],
  }).returning();

  // --- recordProgress ---
  const r1 = await recordProgress(db, user.id, video.id, { msWatched: 15000, lineIds: [line1.id, line2.id, foreignLine.id] });
  check("beacon returns 200", r1.status === 200, r1);
  check("foreign line is not counted", r1.body.linesCounted === 2, r1.body);

  const daily = () => db.select().from(userDailyStats).where(eq(userDailyStats.userId, user.id));
  let [d] = await daily();
  check("daily row: msWatched and linesSeen recorded", d.msWatched === 15000 && d.linesSeen === 2, d);

  const wordStat = async (wid: string) => (await db.select().from(userWordStats)
    .where(and(eq(userWordStats.userId, user.id), eq(userWordStats.wordEntryId, wid))))[0];
  check("views count occurrences (A appeared twice)", (await wordStat(w1.id)).views === 2);
  check("views count occurrences (B appeared twice across lines)", (await wordStat(w2.id)).views === 2);

  const r2 = await recordProgress(db, user.id, video.id, { msWatched: 5000 });
  check("second beacon accumulates (same daily row)", r2.status === 200 && (await daily()).length === 1);
  [d] = await daily();
  check("msWatched summed", d.msWatched === 20000, d.msWatched);

  check("empty beacon is 400", (await recordProgress(db, user.id, video.id, {})).status === 400);
  check("oversized beacon is 400", (await recordProgress(db, user.id, video.id, { msWatched: 999_999 })).status === 400);

  // --- recordWordClick ---
  check("click returns 200", (await recordWordClick(db, user.id, w1.id)).status === 200);
  check("click increments", (await wordStat(w1.id)).clicks === 1);
  check("click on missing word is 404", (await recordWordClick(db, user.id, crypto.randomUUID())).status === 404);

  // --- mine + review bumps ---
  const mined = await mineSentence(db, user.id, { subtitleLineId: line1.id });
  check("mine creates the card", mined.status === 201, mined);
  [d] = await daily();
  check("mine bumps cardsCreated", d.cardsCreated === 1, d);

  const cardId = (mined.body as { card: { id: string } }).card.id;
  const reviewed = await reviewCardById(db, user.id, cardId, 3); // Good
  check("review returns 200", reviewed.status === 200, reviewed);
  [d] = await daily();
  check("review bumps reviewsDone", d.reviewsDone === 1, d);
  const s1 = await wordStat(w1.id);
  check("review counts words in the line (total+ok)", s1.reviewsTotal === 1 && s1.reviewsOk === 1, s1);

  const reviewedAgain = await reviewCardById(db, user.id, cardId, 1); // Again (fail)
  check("second review returns 200", reviewedAgain.status === 200);
  const s1b = await wordStat(w1.id);
  check("failed review adds total but not ok", s1b.reviewsTotal === 2 && s1b.reviewsOk === 1, s1b);

  // Cleanup (user cascade removes stats/cards; videos cascade lines).
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(videos).where(eq(videos.id, video.id));
  await db.delete(videos).where(eq(videos.id, otherVideo.id));
  await db.delete(wordEntries).where(eq(wordEntries.id, w1.id));
  await db.delete(wordEntries).where(eq(wordEntries.id, w2.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => { console.error("E2E crashed:", err); await closeDb(); process.exit(1); });
