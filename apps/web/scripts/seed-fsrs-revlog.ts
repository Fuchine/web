/**
 * Dev seed for checking the in-browser FSRS optimizer (T3.1) by hand: creates a
 * user with a session and a synthetic review history, then prints the session
 * cookie. Not an E2E suite (the runner only picks up e2e-*.ts).
 *
 * The history is simulated: a "true" learner forgets faster than FSRS-7's
 * defaults assume (its weights are the defaults with lower initial
 * stabilities); cards are scheduled with the default parameters (what the app
 * does before optimizing), and each review's outcome is drawn from the true
 * learner's recall probability. So the optimizer has something real to find.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/seed-fsrs-revlog.ts [cards] [days]
 */
import { randomBytes } from "node:crypto";
import { createDb, users, videos, subtitleLines, sentenceCards, reviewLogs, sessions } from "@fuchine/db";
import { DEFAULT_FSRS7_PARAMS, createFsrs, newCardState, validateFsrsParams, type CardState, type ReviewGrade } from "@fuchine/core";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url);
const CARDS = Number(process.argv[2] ?? 150);
const DAYS = Number(process.argv[3] ?? 180);
const DAY = 86_400_000;

// Deterministic PRNG so runs are comparable.
let seed = 20261030;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

async function main() {
  const trueParams = [...DEFAULT_FSRS7_PARAMS];
  for (const i of [0, 1, 2, 3]) trueParams[i] = DEFAULT_FSRS7_PARAMS[i]! * 0.35;
  if (!validateFsrsParams(trueParams).ok) throw new Error("synthetic true params out of bounds");
  const learner = await createFsrs({ params: trueParams });
  const scheduler = await createFsrs();

  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `fsrs-demo-${stamp}@example.com`, name: "FSRS demo" }).returning();
  const [video] = await db.insert(videos).values({
    source: "youtube", sourceId: `fsrs-demo-${stamp}`, url: "https://www.youtube.com/watch?v=demo",
    title: "FSRS demo", language: "ja", status: "done",
  }).returning();
  const lines = await db.insert(subtitleLines).values(
    Array.from({ length: CARDS }, (_, idx) => ({
      videoId: video!.id, idx, tStartMs: idx * 1000, tEndMs: idx * 1000 + 900, textOriginal: `文${idx}`, tokens: [],
    })),
  ).returning();

  const now = Date.now();
  const start = now - DAYS * DAY;
  let totalLogs = 0;
  for (let i = 0; i < CARDS; i++) {
    const cardId = crypto.randomUUID();
    let t = new Date(start + Math.floor(rand() * (DAYS - 7)) * DAY + Math.floor(rand() * 12) * 3_600_000);
    let sched: CardState = newCardState(t);
    let truth: CardState = newCardState(t);
    const logs: (typeof reviewLogs.$inferInsert)[] = [];
    while (t.getTime() < now) {
      const p = truth.state === 0 ? 0 : (learner.retrievability(truth, t) ?? 0);
      const recalled = truth.state === 0 ? rand() < 0.75 : rand() < p;
      const grade: ReviewGrade = !recalled ? 1 : rand() < 0.1 ? 2 : rand() < 0.15 ? 4 : 3;
      const r = scheduler.review(cardId, sched, grade, t);
      logs.push({
        cardId, userId: user!.id, grade, state: r.log.state, due: r.log.due, lastReview: r.log.lastReview,
        stability: r.log.stability, stabilityFast: r.log.stabilityFast, difficulty: r.log.difficulty,
        elapsedDays: r.log.elapsedDays, lastElapsedDays: r.log.lastElapsedDays, scheduledDays: r.log.scheduledDays,
        learningStep: r.log.learningStep, fsrsModel: r.log.model, reviewedAt: t,
      });
      sched = r.card;
      truth = learner.review(cardId, truth, grade, t).card;
      // Learners review a little late, on their own clock.
      t = new Date(sched.due.getTime() + Math.floor(rand() * 6) * 3_600_000);
    }
    await db.insert(sentenceCards).values({
      id: cardId, userId: user!.id, subtitleLineId: lines[i]!.id, videoId: video!.id,
      stability: sched.stability, stabilityFast: sched.stabilityFast, difficulty: sched.difficulty,
      due: sched.due, lastReview: sched.lastReview, state: sched.state, reps: sched.reps, lapses: sched.lapses,
      elapsedDays: sched.elapsedDays, scheduledDays: sched.scheduledDays, learningStep: sched.learningStep,
      fsrsModel: sched.model,
    });
    for (let k = 0; k < logs.length; k += 500) await db.insert(reviewLogs).values(logs.slice(k, k + 500));
    totalLogs += logs.length;
  }

  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ sessionToken: token, userId: user!.id, expires: new Date(now + DAY) });
  console.log(JSON.stringify({ userId: user!.id, cards: CARDS, reviews: totalLogs, sessionToken: token }));
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
