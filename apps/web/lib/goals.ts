// Daily-goals read side (backlog: daily-goals-not-consumed). The goals persist
// in user_settings.daily_goals and are consumed by the review queue; this reads
// today's progress against them for the dashboard. Auth-agnostic and testable;
// the pure buildDailyProgress is unit-tested, getDailyProgress adds the queries.

import { and, eq, gte, sql } from "drizzle-orm";
import { type Database, type DailyGoals, reviewLogs, userDailyStats, userSettings } from "@fuchine/db";
import { dayKey } from "./stats";

/** A single goal's progress today: `done` of `goal` (done may exceed goal). */
export type GoalProgress = {
  key: "newCards" | "reviews" | "watchMinutes";
  done: number;
  goal: number;
};

/** Today's raw activity counters that feed the supported goals. */
export type DailyCounts = { newIntro: number; reviews: number; watchMs: number };

/** Local midnight today — matches cards.ts's daily-allowance boundary. */
function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Pair each *set* daily goal with today's progress, in a stable render order.
 * Only goals with a real data source are emitted: reviewMinutesPerDay is
 * skipped because per-review time isn't tracked. `done` is passed through even
 * when it exceeds the goal (the UI clamps the bar).
 */
export function buildDailyProgress(
  goals: DailyGoals | null | undefined,
  counts: DailyCounts,
): GoalProgress[] {
  if (!goals) return [];
  const out: GoalProgress[] = [];
  if (goals.newCardsPerDay != null) {
    out.push({ key: "newCards", done: counts.newIntro, goal: goals.newCardsPerDay });
  }
  if (goals.maxReviewsPerDay != null) {
    out.push({ key: "reviews", done: counts.reviews, goal: goals.maxReviewsPerDay });
  }
  if (goals.watchMinutesPerDay != null) {
    out.push({
      key: "watchMinutes",
      done: Math.round(counts.watchMs / 60_000),
      goal: goals.watchMinutesPerDay,
    });
  }
  return out;
}

/**
 * Today's progress against the user's daily goals, empty when none are set.
 * New intros and reviews come from review_logs (state=0 is a new introduction,
 * state≠0 a review of an already-introduced card — same split as the review
 * queue's allowances); watch time from today's user_daily_stats row. Queries
 * are gated so a user who only set one goal pays for only what it needs.
 */
export async function getDailyProgress(db: Database, userId: string): Promise<GoalProgress[]> {
  const [settings] = await db
    .select({ dailyGoals: userSettings.dailyGoals })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const goals = settings?.dailyGoals;
  const needsReviewLogs = goals?.newCardsPerDay != null || goals?.maxReviewsPerDay != null;
  const needsWatch = goals?.watchMinutesPerDay != null;
  if (!goals || (!needsReviewLogs && !needsWatch)) return [];

  const counts: DailyCounts = { newIntro: 0, reviews: 0, watchMs: 0 };

  if (needsReviewLogs) {
    const [row] = await db
      .select({
        newIntro: sql<number>`count(distinct case when ${reviewLogs.state} = 0 then ${reviewLogs.cardId} end)`,
        reviews: sql<number>`count(distinct case when ${reviewLogs.state} <> 0 then ${reviewLogs.cardId} end)`,
      })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfToday())));
    counts.newIntro = Number(row?.newIntro ?? 0);
    counts.reviews = Number(row?.reviews ?? 0);
  }

  if (needsWatch) {
    const [row] = await db
      .select({ ms: userDailyStats.msWatched })
      .from(userDailyStats)
      .where(and(eq(userDailyStats.userId, userId), eq(userDailyStats.day, dayKey(new Date()))));
    counts.watchMs = Number(row?.ms ?? 0);
  }

  return buildDailyProgress(goals, counts);
}
