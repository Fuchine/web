/**
 * End-to-end test for the "mine sentence" flow (F1, T1.6).
 *
 * Runs the REAL lib functions (`mineSentence`, `getReviewQueue`,
 * `reviewCardById`) against a live Postgres, seeding a user + video +
 * subtitle line directly via Drizzle. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-mine-sentence.ts
 */
import { createDb, users, videos, subtitleLines, sentenceCards, reviewLogs, type Token } from "@fuchine/db";
import { mineSentence, getReviewQueue, reviewCardById } from "../lib/cards";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url);

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
  console.log("\n=== E2E: mine sentence ===\n");

  // --- Seed: user + video + a tokenized subtitle line ---
  const [user] = await db
    .insert(users)
    .values({ email: `e2e-mine-${Date.now()}@example.com` })
    .returning();

  const [video] = await db
    .insert(videos)
    .values({
      source: "youtube",
      sourceId: `e2e-${Date.now()}`,
      url: "https://www.youtube.com/watch?v=e2e",
      title: "E2E mine sentence",
      language: "ja",
      status: "done",
    })
    .returning();

  const tokens: Token[] = [
    { surface: "猫", lemma: "猫", reading: "ねこ", romaji: "neko", pos: "noun", wordEntryId: null },
    { surface: "が", lemma: "が", reading: "が", romaji: "ga", pos: "particle", wordEntryId: null },
    { surface: "好き", lemma: "好き", reading: "すき", romaji: "suki", pos: "adj", wordEntryId: null },
  ];
  const [line] = await db
    .insert(subtitleLines)
    .values({
      videoId: video.id,
      idx: 0,
      tStartMs: 1000,
      tEndMs: 3500,
      textOriginal: "猫が好き",
      textTranslation: "I like cats",
      tokens,
    })
    .returning();

  console.log(`Seeded user=${user.id} video=${video.id} line=${line.id}\n`);

  // --- 1. Validation: missing subtitleLineId -> 400 ---
  console.log("1. Validation");
  const noId = await mineSentence(db, user.id, {});
  check("missing subtitleLineId => 400", noId.status === 400, noId);

  // --- 2. Not found: bogus line id -> 404 ---
  console.log("2. Not found");
  const bogus = await mineSentence(db, user.id, {
    subtitleLineId: "00000000-0000-0000-0000-000000000000",
  });
  check("nonexistent line => 404", bogus.status === 404, bogus);

  // --- 3. Mine a line -> 201 created ---
  console.log("3. Mine (create)");
  const created = await mineSentence(db, user.id, { subtitleLineId: line.id, notes: "first mine" });
  check("first mine => 201", created.status === 201, created);
  check("created flag true", created.body.created === true);
  const card = created.body.card as { id: string; cardType: string; state: number; notes: string | null };
  check("default cardType listening", card?.cardType === "listening", card?.cardType);
  check("notes persisted", card?.notes === "first mine", card?.notes);
  check("FSRS new state (0)", card?.state === 0, card?.state);

  // --- 4. Dedup: mining the same (user, line, type) again -> 200, created:false ---
  console.log("4. Dedup");
  const dup = await mineSentence(db, user.id, { subtitleLineId: line.id });
  check("second mine => 200", dup.status === 200, dup);
  check("created flag false", dup.body.created === false);
  const dupCard = dup.body.card as { id: string };
  check("returns same card id", dupCard?.id === card?.id, { first: card?.id, dup: dupCard?.id });

  const rowCount = await db.select().from(sentenceCards).where(eqUser(user.id));
  check("exactly one card row after dedup", rowCount.length === 1, rowCount.length);

  // --- 5. Different cardType is a distinct card -> 201 ---
  console.log("5. Distinct cardType");
  const cloze = await mineSentence(db, user.id, { subtitleLineId: line.id, cardType: "cloze" });
  check("cloze mine => 201", cloze.status === 201, cloze);
  check("cloze is a new card", (cloze.body.card as { id: string })?.id !== card?.id);

  // --- 6. Round-trip: mined card shows up in the review queue ---
  console.log("6. Review queue round-trip");
  const { cards: queue } = await getReviewQueue(db, user.id);
  check("two cards now due", queue.length === 2, queue.length);
  const listening = queue.find((q) => q.cardType === "listening");
  check("queue carries the sentence text", listening?.sentence.text === "猫が好き", listening?.sentence.text);
  check("queue carries the translation", listening?.sentence.translation === "I like cats");
  check("queue carries the clip timestamps", listening?.clip.startMs === 1000 && listening?.clip.endMs === 3500, listening?.clip);
  check("queue carries the YouTube source", listening?.clip.source === "youtube");
  check("queue carries tokens", (listening?.tokens?.length ?? 0) === 3, listening?.tokens?.length);
  check("queue offers FSRS preview intervals", !!listening?.intervals, listening?.intervals);

  // --- 7. Review the mined card with FSRS (grade Good) reschedules it out ---
  console.log("7. FSRS review");
  const before = listening!;
  const reviewed = await reviewCardById(db, user.id, before.cardId, 3);
  check("review => 200", reviewed.status === 200, reviewed);
  check("reps incremented", reviewed.body.reps === 1, reviewed.body.reps);
  const newDue = new Date(reviewed.body.due as string);
  check("due pushed into the future", newDue.getTime() > Date.now(), newDue.toISOString());

  const { cards: afterQueue } = await getReviewQueue(db, user.id);
  check("reviewed card left the due queue", afterQueue.find((q) => q.cardId === before.cardId) === undefined, afterQueue.map((q) => q.cardType));

  // --- 7b. The review wrote a coherent FSRS log (D6) ---
  // The review_logs history is the declared basis for re-optimizing FSRS
  // params; a reschedule that loses its log is a data bug. Assert the write.
  console.log("7b. FSRS log write (D6 history)");
  const logs1 = await db.select().from(reviewLogs).where(eqLogCard(before.cardId));
  check("review wrote exactly one FSRS log", logs1.length === 1, logs1.length);
  check("log records the grade", logs1[0]?.grade === 3, logs1[0]?.grade);
  check("log carries FSRS scheduling fields", logs1[0]?.stability != null && logs1[0]?.scheduledDays != null, { stability: logs1[0]?.stability, scheduledDays: logs1[0]?.scheduledDays });

  // A second review appends (never overwrites) — the history grows by one.
  const secondReview = await reviewCardById(db, user.id, before.cardId, 3);
  check("second review => 200", secondReview.status === 200, secondReview);
  check("reps incremented again", secondReview.body.reps === 2, secondReview.body.reps);
  const logs2 = await db.select().from(reviewLogs).where(eqLogCard(before.cardId));
  check("second review appends a second log (append-only history)", logs2.length === 2, logs2.length);

  // --- 8. Invalid grade rejected (and writes no log) ---
  console.log("8. Invalid grade");
  const badGrade = await reviewCardById(db, user.id, before.cardId, 9);
  check("grade 9 => 400", badGrade.status === 400, badGrade);
  const logs3 = await db.select().from(reviewLogs).where(eqLogCard(before.cardId));
  check("rejected grade wrote no log", logs3.length === 2, logs3.length);

  // --- Cleanup --- deleting the user cascades to its cards + logs; the video
  // cascades to its subtitle lines. Leaves the DB as we found it.
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(videos).where(eq(videos.id, video.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

// Small local helpers so the script stays import-light.
import { eq } from "drizzle-orm";
function eqUser(id: string) {
  return eq(sentenceCards.userId, id);
}
function eqLogCard(cardId: string) {
  return eq(reviewLogs.cardId, cardId);
}
async function closeDb() {
  // postgres-js keeps the socket open; end it so the process can exit cleanly.
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => {
  console.error("E2E crashed:", err);
  await closeDb();
  process.exit(1);
});
