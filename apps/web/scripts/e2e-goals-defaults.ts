/**
 * End-to-end test for SRS defaults and daily load (T3.5). Runs the REAL lib
 * functions (getReviewQueue, countDueCards, getDailyProgress,
 * getTomorrowProjection, updateSettings) against a live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-goals-defaults.ts
 */
import {
  createDb, users, videos, subtitleLines, sentenceCards, reviewLogs, userSettings, type Database,
} from "@fuchine/db";
import { eq } from "drizzle-orm";
import { countDueCards, getReviewQueue } from "../lib/cards";
import { getDailyProgress, getTomorrowProjection } from "../lib/goals";
import { updateSettings } from "../lib/settings";
import { DEFAULT_NEW_CARDS_PER_DAY } from "../lib/srs-defaults";

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

const NEW_CARDS = 15;

async function main() {
  console.log("\n=== E2E: SRS defaults + tomorrow projection (T3.5) ===\n");

  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `e2e-goals-${stamp}@example.com` }).returning();
  const [video] = await db.insert(videos).values({
    sourceId: `e2e-goals-${stamp}`, url: "https://youtube.com/watch?v=e2e", title: "E2E goals",
  }).returning();
  const lines = await db.insert(subtitleLines).values(
    Array.from({ length: NEW_CARDS + 4 }, (_, i) => ({
      videoId: video.id, idx: i, tStartMs: i * 1000, tEndMs: i * 1000 + 900, textOriginal: `行${i}`, tokens: [],
    })),
  ).returning();

  // 15 new (state 0) cards, due from creation.
  await db.insert(sentenceCards).values(
    lines.slice(0, NEW_CARDS).map((l) => ({ userId: user.id, subtitleLineId: l.id, videoId: video.id })),
  );

  // --- 1. Null dailyGoals → effective default of 10 new/day ---
  console.log("1. Default new-card cap for a user who never set goals");
  await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
  const [s0] = await db.select({ g: userSettings.dailyGoals }).from(userSettings).where(eq(userSettings.userId, user.id));
  check("starts with null dailyGoals", s0?.g == null, s0);
  let queue = (await getReviewQueue(db, user.id, 50)).cards;
  check(`queue serves ${DEFAULT_NEW_CARDS_PER_DAY} of ${NEW_CARDS} new cards`, queue.length === DEFAULT_NEW_CARDS_PER_DAY, queue.length);
  // T3.6 badge fix: the badge counts what the queue serves, not the backlog.
  let badge = await countDueCards(db, user.id);
  check(`review badge shows ${DEFAULT_NEW_CARDS_PER_DAY}, not ${NEW_CARDS}`, badge === DEFAULT_NEW_CARDS_PER_DAY, badge);
  let goals = await getDailyProgress(db, user.id);
  check("dashboard shows the default new-cards goal",
    goals.length === 1 && goals[0]!.key === "newCards" && goals[0]!.goal === DEFAULT_NEW_CARDS_PER_DAY, goals);
  const [s1] = await db.select({ g: userSettings.dailyGoals }).from(userSettings).where(eq(userSettings.userId, user.id));
  check("reading the default does not write it", s1?.g == null, s1);

  // --- 2. An explicit value wins and is never overwritten ---
  console.log("2. Explicit newCardsPerDay");
  const set = await updateSettings(db, user.id, { dailyGoals: { newCardsPerDay: 12 } }, undefined);
  check("settings accepts newCardsPerDay", set.status === 200, set);
  queue = (await getReviewQueue(db, user.id, 50)).cards;
  check("queue honors the explicit 12", queue.length === 12, queue.length);
  badge = await countDueCards(db, user.id);
  check("review badge honors the explicit 12", badge === 12, badge);
  goals = await getDailyProgress(db, user.id);
  check("goal shows 12", goals[0]?.goal === 12, goals);

  const cleared = await updateSettings(db, user.id, { dailyGoals: { newCardsPerDay: null, maxReviewsPerDay: 50 } }, undefined);
  check("per-field null clears just that goal",
    cleared.status === 200 && JSON.stringify(cleared.body.dailyGoals) === JSON.stringify({ maxReviewsPerDay: 50 }), cleared.body);
  queue = (await getReviewQueue(db, user.id, 50)).cards;
  check("cleared value falls back to the default", queue.length === DEFAULT_NEW_CARDS_PER_DAY, queue.length);
  const noCap = await updateSettings(db, user.id, { dailyGoals: { maxReviewsPerDay: null } }, undefined);
  check("maxReviewsPerDay can be removed (back to no limit)",
    JSON.stringify(noCap.body.dailyGoals) === JSON.stringify({}), noCap.body);

  // --- 3. Tomorrow projection ---
  console.log("3. Tomorrow projection");
  const now = new Date();
  const at = (dayOffset: number, hour: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour);
  const reviewCard = (lineIdx: number, due: Date) => ({
    userId: user.id, subtitleLineId: lines[lineIdx]!.id, videoId: video.id,
    state: 2, reps: 3, stability: 5, difficulty: 5, due, lastReview: at(-3, 12), scheduledDays: 3,
  });
  const reviewRows = await db.insert(sentenceCards).values([
    reviewCard(NEW_CARDS, new Date(now.getTime() - 3_600_000)), // overdue backlog → counts
    reviewCard(NEW_CARDS + 1, at(1, 12)),                       // due tomorrow → counts
    reviewCard(NEW_CARDS + 2, at(1, 23)),                       // late tomorrow → counts
    reviewCard(NEW_CARDS + 3, at(2, 12)),                       // day after → excluded
  ]).returning();

  let p = await getTomorrowProjection(db, user.id);
  check("counts reviews due by the end of tomorrow (backlog included)", p.reviews === 3, p);
  check(`caps pending new cards at the default ${DEFAULT_NEW_CARDS_PER_DAY}`, p.newCards === DEFAULT_NEW_CARDS_PER_DAY, p);
  check("total = reviews + new", p.total === 3 + DEFAULT_NEW_CARDS_PER_DAY, p);
  check("no history → fallback pace of 8 s", p.secondsPerReview === 8, p);
  check("minutes from the fallback pace", p.minutes === Math.ceil((p.total * 8) / 60), p);
  check("no budget set", p.budgetMinutes === null && p.overBudget === false, p);
  badge = await countDueCards(db, user.id);
  check("review badge = due reviews (1 overdue) + capped new", badge === 1 + DEFAULT_NEW_CARDS_PER_DAY, badge);

  // 15 reviews 7 s apart (one session) → measured pace of 7 s.
  const base = now.getTime() - 86_400_000;
  await db.insert(reviewLogs).values(Array.from({ length: 15 }, (_, i) => ({
    cardId: reviewRows[0]!.id, userId: user.id, grade: 3, state: 2, due: new Date(base),
    stability: 5, difficulty: 5, elapsedDays: 1, lastElapsedDays: 1, scheduledDays: 3,
    reviewedAt: new Date(base + i * 7000),
  })));
  p = await getTomorrowProjection(db, user.id);
  check("pace measured from review_logs gaps", p.secondsPerReview === 7, p);
  check("minutes use the measured pace", p.minutes === Math.ceil((p.total * 7) / 60), p);

  await updateSettings(db, user.id, { dailyGoals: { maxReviewsPerDay: 1, reviewMinutesPerDay: 1 } }, undefined);
  p = await getTomorrowProjection(db, user.id);
  check("maxReviewsPerDay caps projected reviews", p.reviews === 1, p);
  check("reviewMinutesPerDay is surfaced as the budget", p.budgetMinutes === 1, p);
  check("over budget is flagged", p.overBudget === true && p.minutes > 1, p);

  // Introduce 4 new cards today (state-0 logs) → the new allowance shrinks to 6.
  const newCardRows = await db.select({ id: sentenceCards.id }).from(sentenceCards)
    .where(eq(sentenceCards.userId, user.id)).limit(NEW_CARDS);
  const freshIds = newCardRows.filter((r) => !reviewRows.some((rr) => rr.id === r.id)).slice(0, 4);
  await db.insert(reviewLogs).values(freshIds.map((r) => ({
    cardId: r.id, userId: user.id, grade: 3, state: 0, due: now,
    stability: 1, difficulty: 5, elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 0,
  })));
  badge = await countDueCards(db, user.id);
  check("review badge subtracts today's introductions from the new allowance",
    badge === 1 + (DEFAULT_NEW_CARDS_PER_DAY - 4), badge);

  // Cleanup (user cascade removes settings/cards/logs; video cascade lines).
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(videos).where(eq(videos.id, video.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => { console.error("E2E crashed:", err); await closeDb(); process.exit(1); });
