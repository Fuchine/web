/**
 * End-to-end test for the "mine sentence" flow (F1, T1.6).
 *
 * Runs the REAL lib functions (`mineSentence`, `getReviewQueue`,
 * `reviewCardById`, and the T3.6 curation queue `listUncuratedCards`) against a live Postgres, seeding a user + video +
 * subtitle line directly via Drizzle. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-mine-sentence.ts
 */
import { createDb, users, videos, subtitleLines, sentenceCards, reviewLogs, aiExplanations, type Token } from "@fuchine/db";
import { PROMPT_VERSION } from "@fuchine/llm";
import { mineSentence, getReviewQueue, reviewCardById, updateCardNotes, deleteCard } from "../lib/cards";
import { countUncuratedCards, listUncuratedCards } from "../lib/phrases";

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

  // --- 5. cardType allowlist + notes cap (B1) -> 400, nothing written ---
  console.log("5. cardType allowlist + notes cap");
  const cloze = await mineSentence(db, user.id, { subtitleLineId: line.id, cardType: "cloze" });
  check("unknown cardType => 400", cloze.status === 400, cloze);
  const longNotes = await mineSentence(db, user.id, { subtitleLineId: line.id, notes: "x".repeat(2001) });
  check("notes over 2000 chars => 400", longNotes.status === 400, longNotes.status);
  const afterRejects = await db.select().from(sentenceCards).where(eqUser(user.id));
  check("rejected mines wrote no card", afterRejects.length === 1, afterRejects.length);

  console.log("5b. PATCH notes");
  const patched = await updateCardNotes(db, user.id, card.id, { notes: "edited" });
  check("PATCH notes => 200", patched.status === 200 && patched.body.notes === "edited", patched);
  const patchLong = await updateCardNotes(db, user.id, card.id, { notes: "x".repeat(2001) });
  check("PATCH notes over 2000 chars => 400", patchLong.status === 400, patchLong.status);
  const patchMissing = await updateCardNotes(db, user.id, card.id, {});
  check("PATCH without notes => 400", patchMissing.status === 400, patchMissing.status);

  // --- 6. Round-trip: mined card shows up in the review queue ---
  console.log("6. Review queue round-trip");
  const { cards: queue } = await getReviewQueue(db, user.id);
  check("one card now due", queue.length === 1, queue.length);
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

  // --- 9. Undo (DELETE /api/cards/:id): owner-scoped, logs cascade (F1) ---
  console.log("9. Delete (Undo after mining)");
  const [other] = await db
    .insert(users)
    .values({ email: `e2e-mine-other-${Date.now()}@example.com` })
    .returning();
  const otherMine = await mineSentence(db, other.id, { subtitleLineId: line.id });
  check("other user mines the same line => 201", otherMine.status === 201, otherMine.status);
  const otherCardId = (otherMine.body.card as { id: string }).id;

  const stolen = await deleteCard(db, user.id, otherCardId);
  check("deleting another user's card => 404", stolen.status === 404, stolen);
  const otherStill = await db.select().from(sentenceCards).where(eq(sentenceCards.id, otherCardId));
  check("other user's card survives", otherStill.length === 1, otherStill.length);

  const undo = await deleteCard(db, user.id, before.cardId);
  check("deleting own card => 200", undo.status === 200 && undo.body.deleted === true, undo);
  const gone = await db.select().from(sentenceCards).where(eq(sentenceCards.id, before.cardId));
  check("card is gone", gone.length === 0, gone.length);
  const logsGone = await db.select().from(reviewLogs).where(eqLogCard(before.cardId));
  check("its review logs cascaded", logsGone.length === 0, logsGone.length);
  const again = await deleteCard(db, user.id, before.cardId);
  check("deleting it again => 404", again.status === 404, again.status);
  const { cards: emptyQueue } = await getReviewQueue(db, user.id);
  check("deleted card is out of the queue", emptyQueue.every((q) => q.cardId !== before.cardId), emptyQueue.length);

  // Re-mining after Undo creates a fresh card (the dedup slot was freed).
  const remine = await mineSentence(db, user.id, { subtitleLineId: line.id });
  check("re-mine after delete => 201", remine.status === 201, remine.status);
  const remineId = (remine.body.card as { id: string }).id;

  // --- 10. Mine now, curate later (T3.6) ---
  // Uncurated = notes IS NULL and never reviewed (state 0). "" = curated, no notes.
  console.log("10. Curation queue");
  const [line2] = await db
    .insert(subtitleLines)
    .values({
      videoId: video.id, idx: 1, tStartMs: 4000, tEndMs: 6000,
      textOriginal: "犬も好き", textTranslation: "I like dogs too", tokens,
    })
    .returning();
  const explanation = { breakdown: [], plainTerms: "Dogs too." };
  await db.insert(aiExplanations).values([
    { subtitleLineId: line2.id, kind: "line", explanationLanguage: "en", promptVersion: PROMPT_VERSION, content: explanation },
    { subtitleLineId: line2.id, kind: "line", explanationLanguage: "en", promptVersion: PROMPT_VERSION - 1, content: { breakdown: [], plainTerms: "stale" } },
    { subtitleLineId: line.id, kind: "line", explanationLanguage: "pt", promptVersion: PROMPT_VERSION, content: { breakdown: [], plainTerms: "outra língua" } },
  ]);
  await new Promise((r) => setTimeout(r, 5)); // distinct created_at for the order check
  const mined2 = await mineSentence(db, user.id, { subtitleLineId: line2.id });
  check("mine without notes => 201", mined2.status === 201, mined2.status);
  const card2Id = (mined2.body.card as { id: string; notes: string | null }).id;
  check("mined without notes stores NULL", (mined2.body.card as { notes: string | null }).notes === null);

  let uncurated = await listUncuratedCards(db, user.id);
  check("both NULL-notes new cards are uncurated", uncurated.items.length === 2, uncurated.items.map((i) => i.cardId));
  check("newest first", uncurated.items[0]?.cardId === card2Id && uncurated.items[1]?.cardId === remineId, uncurated.items.map((i) => i.cardId));
  check("other users' cards are not listed", uncurated.items.every((i) => i.cardId !== otherCardId));
  check("cached explanation at the current prompt version is attached",
    uncurated.items[0]?.explanation?.plainTerms === "Dogs too.", uncurated.items[0]?.explanation);
  check("no explanation in the user's language → null (pt cache ignored)",
    uncurated.items[1]?.explanation === null, uncurated.items[1]?.explanation);
  check("row carries the clip + video", uncurated.items[0]?.tStartMs === 4000 && uncurated.items[0]?.tEndMs === 6000
    && uncurated.items[0]?.videoTitle === "E2E mine sentence", uncurated.items[0]);
  check("count matches", (await countUncuratedCards(db, user.id)) === 2);
  const explainRows = await db.select().from(aiExplanations).where(eq(aiExplanations.subtitleLineId, line.id));
  check("listing generated no explanation", explainRows.length === 1, explainRows.length);

  const p1 = await listUncuratedCards(db, user.id, { limit: 1 });
  check("page 1 of 1 has a cursor", p1.items.length === 1 && p1.nextCursor !== null, p1.nextCursor);
  const p2 = await listUncuratedCards(db, user.id, { limit: 1, cursor: p1.nextCursor! });
  check("page 2 continues without overlap", p2.items.length === 1 && p2.items[0]?.cardId === remineId && p2.nextCursor === null, p2);

  const curated = await updateCardNotes(db, user.id, card2Id, { notes: "" });
  check("Done with no notes => 200, notes ''", curated.status === 200 && curated.body.notes === "", curated.body);
  uncurated = await listUncuratedCards(db, user.id);
  check("curated ('' notes) card leaves the queue", uncurated.items.length === 1 && uncurated.items[0]?.cardId === remineId, uncurated.items.map((i) => i.cardId));
  const { cards: stillQueued } = await getReviewQueue(db, user.id);
  check("curated card still goes to review", stillQueued.some((q) => q.cardId === card2Id), stillQueued.map((q) => q.cardId));

  const reviewedNoNotes = await reviewCardById(db, user.id, remineId, 3);
  check("reviewing an uncurated card => 200", reviewedNoNotes.status === 200);
  check("a reviewed card (state ≠ 0) leaves the queue", (await countUncuratedCards(db, user.id)) === 0);

  await db.delete(users).where(eq(users.id, other.id));

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
