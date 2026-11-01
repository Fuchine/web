// Daily-goals read side (backlog: daily-goals-not-consumed; T3.5). The goals
// persist in user_settings.daily_goals and are consumed by the review queue;
// this reads today's progress against them and projects tomorrow's review load
// for the dashboard. Auth-agnostic and testable: the pure builders
// (buildDailyProgress, estimateSecondsPerReview, buildTomorrowProjection) are
// unit-tested; getDailyProgress / getTomorrowProjection add the queries.

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  type Database, type DailyGoals, reviewLogs, sentenceCards, userDailyStats, userSettings,
} from "@fuchine/db";
import { dayKey } from "./stats";
import { effectiveNewCardsPerDay, FALLBACK_SECONDS_PER_REVIEW, reviewMinutes } from "./srs-defaults";

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
 * Local midnight that ENDS tomorrow (= start of the day after tomorrow), the
 * exclusive bound of the "due by the end of tomorrow" projection. Same local-TZ
 * convention as stats.ts `dayKey` and the daily allowances; built from calendar
 * fields so DST days (23/25 h) land on midnight too.
 */
export function endOfTomorrow(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
}

/**
 * Pair each daily goal with today's progress, in a stable render order. The
 * new-cards goal is always present — the queue always caps new cards, at the
 * user's value or DEFAULT_NEW_CARDS_PER_DAY (T3.5) — the others only when set.
 * Only goals with a real data source are emitted: reviewMinutesPerDay is
 * skipped because per-review time isn't tracked (it's shown as a budget on the
 * tomorrow projection instead). `done` is passed through even when it exceeds
 * the goal (the UI clamps the bar).
 */
export function buildDailyProgress(
  goals: DailyGoals | null | undefined,
  counts: DailyCounts,
): GoalProgress[] {
  const out: GoalProgress[] = [
    { key: "newCards", done: counts.newIntro, goal: effectiveNewCardsPerDay(goals) },
  ];
  if (!goals) return out;
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

async function readGoals(db: Database, userId: string): Promise<DailyGoals | null> {
  const [settings] = await db
    .select({ dailyGoals: userSettings.dailyGoals })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return settings?.dailyGoals ?? null;
}

/**
 * Today's progress against the user's daily goals (the new-cards goal is
 * always there, at the effective default when unset). New intros and reviews
 * come from review_logs (state=0 is a new introduction, state≠0 a review of an
 * already-introduced card — same split as the review queue's allowances);
 * watch time from today's user_daily_stats row, queried only when that goal is
 * set.
 */
export async function getDailyProgress(db: Database, userId: string): Promise<GoalProgress[]> {
  const goals = await readGoals(db, userId);
  const counts: DailyCounts = { newIntro: 0, reviews: 0, watchMs: 0 };

  const [logs] = await db
    .select({
      newIntro: sql<number>`count(distinct case when ${reviewLogs.state} = 0 then ${reviewLogs.cardId} end)`,
      reviews: sql<number>`count(distinct case when ${reviewLogs.state} <> 0 then ${reviewLogs.cardId} end)`,
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfToday())));
  counts.newIntro = Number(logs?.newIntro ?? 0);
  counts.reviews = Number(logs?.reviews ?? 0);

  if (goals?.watchMinutesPerDay != null) {
    const [row] = await db
      .select({ ms: userDailyStats.msWatched })
      .from(userDailyStats)
      .where(and(eq(userDailyStats.userId, userId), eq(userDailyStats.day, dayKey(new Date()))));
    counts.watchMs = Number(row?.ms ?? 0);
  }

  return buildDailyProgress(goals, counts);
}

/* ------------------------------------------------------------------ */
/* Tomorrow projection (T3.5)                                          */
/* ------------------------------------------------------------------ */

/** How many recent review_logs feed the seconds-per-review estimate. */
const PACE_SAMPLE = 200;
/** Gaps outside [min, max] seconds aren't answer time (double-submit / a break). */
const PACE_GAP_MIN_S = 1;
const PACE_GAP_MAX_S = 120;
/** Fewer in-session gaps than this → not enough signal, use the fallback. */
const PACE_MIN_GAPS = 10;

/**
 * Average seconds per review measured from review_logs timestamps. review_logs
 * has no duration column, so the answer time is read off the gap between
 * consecutive reviews: inside a session each gap ≈ one card's time. Gaps over
 * PACE_GAP_MAX_S are breaks between sessions and are dropped, as are sub-second
 * ones. Uses the MEDIAN (robust to a few slow cards / pauses that slipped under
 * the cap). Falls back to FALLBACK_SECONDS_PER_REVIEW with < PACE_MIN_GAPS
 * usable gaps. Order of `reviewedAt` doesn't matter. Pure.
 */
export function estimateSecondsPerReview(reviewedAt: Date[]): number {
  const t = reviewedAt.map((d) => d.getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) {
    const s = (t[i]! - t[i - 1]!) / 1000;
    if (s >= PACE_GAP_MIN_S && s <= PACE_GAP_MAX_S) gaps.push(s);
  }
  if (gaps.length < PACE_MIN_GAPS) return FALLBACK_SECONDS_PER_REVIEW;
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return Math.round(median * 10) / 10;
}

export type TomorrowProjection = {
  /** Already-introduced cards due by the end of tomorrow, after maxReviewsPerDay. */
  reviews: number;
  /** New cards tomorrow's queue will introduce (pending new, capped by the daily new limit). */
  newCards: number;
  /** reviews + newCards: the items tomorrow's session will show. */
  total: number;
  /** Estimated minutes for `total` at `secondsPerReview`. */
  minutes: number;
  secondsPerReview: number;
  /** The user's reviewMinutesPerDay (display-only budget), null when unset. */
  budgetMinutes: number | null;
  /** True when the estimate exceeds the budget. */
  overBudget: boolean;
};

/**
 * Tomorrow's review load, as the queue will serve it. `reviewsDue` counts every
 * already-introduced card due by the end of tomorrow — including today's not
 * yet done, which is the point: skipping today rolls them into tomorrow (the
 * number drops as soon as they're reviewed and rescheduled). Pending new cards
 * count only up to the daily new-card cap (a fresh day's full allowance), and
 * reviews up to maxReviewsPerDay when set. Pure.
 */
export function buildTomorrowProjection(input: {
  reviewsDue: number;
  newPending: number;
  goals: DailyGoals | null | undefined;
  secondsPerReview: number;
}): TomorrowProjection {
  const { goals, secondsPerReview } = input;
  const reviewCap = goals?.maxReviewsPerDay ?? Infinity;
  const reviews = Math.min(Math.max(0, input.reviewsDue), reviewCap);
  const newCards = Math.min(Math.max(0, input.newPending), effectiveNewCardsPerDay(goals));
  const total = reviews + newCards;
  const minutes = reviewMinutes(total, secondsPerReview);
  const budgetMinutes = goals?.reviewMinutesPerDay ?? null;
  return {
    reviews, newCards, total, minutes, secondsPerReview, budgetMinutes,
    overBudget: budgetMinutes != null && minutes > budgetMinutes,
  };
}

/**
 * Project tomorrow's load for the dashboard ("Tomorrow: 34 reviews · ~5 min").
 * One aggregate over the user's cards due before the end of tomorrow —
 * `user_id = ? and due < ?`, a range scan on sentence_cards_user_due_idx (new
 * cards are due from creation, so they fall in the same range) — plus the last
 * PACE_SAMPLE review timestamps for the pace (review_logs_user_time_idx).
 */
export async function getTomorrowProjection(
  db: Database,
  userId: string,
  now = new Date(),
): Promise<TomorrowProjection> {
  const [goals, [counts], recent] = await Promise.all([
    readGoals(db, userId),
    db
      .select({
        reviewsDue: sql<number>`count(*) filter (where ${sentenceCards.state} <> 0)`,
        newPending: sql<number>`count(*) filter (where ${sentenceCards.state} = 0)`,
      })
      .from(sentenceCards)
      .where(and(eq(sentenceCards.userId, userId), lt(sentenceCards.due, endOfTomorrow(now)))),
    db
      .select({ reviewedAt: reviewLogs.reviewedAt })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, userId))
      .orderBy(desc(reviewLogs.reviewedAt))
      .limit(PACE_SAMPLE),
  ]);

  return buildTomorrowProjection({
    reviewsDue: Number(counts?.reviewsDue ?? 0),
    newPending: Number(counts?.newPending ?? 0),
    goals,
    secondsPerReview: estimateSecondsPerReview(recent.map((r) => r.reviewedAt)),
  });
}
