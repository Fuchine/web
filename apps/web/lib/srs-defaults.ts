// SRS daily-load defaults (T3.5). Pure and client-safe (no DB imports): shared
// by the onboarding/settings views and the server-side queue/goals code so the
// default lives in exactly one place.

import type { DailyGoals } from "@fuchine/db";

/**
 * New cards introduced per day when the user never chose a value. The
 * immersion community consensus (TheMoeWay, Migaku's guide, Refold routines —
 * docs/PESQUISA_MERCADO-2026-10-29.md §2/§6) is 10/day: enough to grow, low
 * enough that the review load it compounds into stays under ~1 h/day.
 *
 * Semantics of a missing value: `dailyGoals` null or without `newCardsPerDay`
 * means "use the default", NOT "unlimited". An explicit value always wins; it
 * is never overwritten. Reviews have no default cap on purpose — capping due
 * reviews only turns load into debt.
 */
export const DEFAULT_NEW_CARDS_PER_DAY = 10;

/**
 * Seconds per review assumed when the user's review_logs don't have enough
 * in-session history to measure it (see estimateSecondsPerReview). ~8 s is a
 * typical sentence-card answer time with a short clip.
 */
export const FALLBACK_SECONDS_PER_REVIEW = 8;

/** The new-card cap the queue actually applies for these goals. */
export function effectiveNewCardsPerDay(goals: DailyGoals | null | undefined): number {
  return goals?.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY;
}

/** Minutes for `n` reviews at `secondsPerReview`, rounded up (0 stays 0). */
export function reviewMinutes(n: number, secondsPerReview: number): number {
  if (n <= 0) return 0;
  return Math.max(1, Math.ceil((n * secondsPerReview) / 60));
}

/** The fields of a tomorrow projection the dashboard line needs. */
export type TomorrowSummaryInput = {
  reviews: number;
  newCards: number;
  total: number;
  minutes: number;
  secondsPerReview: number;
  budgetMinutes: number | null;
  overBudget: boolean;
};

/**
 * Dashboard copy for the tomorrow projection: the headline ("Tomorrow: 34
 * reviews · ~5 min"), an optional budget note, and a longer explanation for
 * the tooltip. Pure.
 */
export function tomorrowSummary(t: TomorrowSummaryInput): {
  headline: string;
  budget: string | null;
  detail: string;
} {
  const headline = t.total === 0
    ? "Tomorrow: nothing due"
    : `Tomorrow: ${t.total} review${t.total === 1 ? "" : "s"} · ~${t.minutes} min`;
  const budget = t.budgetMinutes == null || t.total === 0
    ? null
    : t.overBudget
      ? `over your ${t.budgetMinutes} min budget`
      : `within your ${t.budgetMinutes} min budget`;
  const parts = [`${t.reviews} due`, `${t.newCards} new`].join(" + ");
  const detail =
    `${parts}. Counts cards due by the end of tomorrow, including any you don't finish today; ` +
    `estimated at ~${t.secondsPerReview} s per card.`;
  return { headline, budget, detail };
}
