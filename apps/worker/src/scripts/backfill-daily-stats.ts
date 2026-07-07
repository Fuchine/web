// One-shot: seed user_daily_stats with review/mining activity that predates the
// per-day writers (shipped 2026-07-04), so historical streaks survive the switch
// to deriving active days from user_daily_stats (see
// backlog/stats-unbounded-review-scan.md). Idempotent & self-reconciling: it sets
// reviews_done/cards_created to the true per-day counts from review_logs /
// sentence_cards, and leaves the beacon-only fields (ms_watched, lines_seen)
// untouched. Days are bucketed in the process-local timezone to match the
// writers' dayKey — run it in the same TZ as the app.
// Run: pnpm --filter @fuchine/worker backfill:daily-stats

import { createDb, reviewLogs, sentenceCards, userDailyStats, type Database } from "@fuchine/db";
import { env } from "../env";

/** Local YYYY-MM-DD — mirrors apps/web/lib/stats.ts dayKey (process-local TZ). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

async function main() {
  const db = createDb(env.databaseUrl) as Database;

  // Read the source tables once (one-off cost) and bucket by (user, local day).
  const reviews = await db
    .select({ userId: reviewLogs.userId, reviewedAt: reviewLogs.reviewedAt })
    .from(reviewLogs);
  const cards = await db
    .select({ userId: sentenceCards.userId, createdAt: sentenceCards.createdAt })
    .from(sentenceCards);

  const perDay = new Map<string, { userId: string; day: string; reviews: number; cards: number }>();
  const bump = (userId: string, day: string, field: "reviews" | "cards") => {
    const k = `${userId}\t${day}`;
    const cur = perDay.get(k) ?? { userId, day, reviews: 0, cards: 0 };
    cur[field]++;
    perDay.set(k, cur);
  };
  for (const r of reviews) bump(r.userId, dayKey(r.reviewedAt), "reviews");
  for (const c of cards) bump(c.userId, dayKey(c.createdAt), "cards");

  let upserts = 0;
  for (const { userId, day, reviews: rv, cards: cd } of perDay.values()) {
    await db
      .insert(userDailyStats)
      .values({ userId, day, reviewsDone: rv, cardsCreated: cd })
      .onConflictDoUpdate({
        target: [userDailyStats.userId, userDailyStats.day],
        // Reconcile to the true source counts; leave beacon-only fields (ms/lines) alone.
        set: { reviewsDone: rv, cardsCreated: cd },
      });
    upserts++;
  }
  console.log(
    `[backfill] reconciled ${upserts} user-days from ${reviews.length} reviews + ${cards.length} cards`,
  );

  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed", err);
    process.exit(1);
  });
