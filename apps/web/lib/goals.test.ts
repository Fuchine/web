import { describe, it, expect } from "vitest";
import {
  buildDailyProgress, buildTomorrowProjection, endOfTomorrow, estimateSecondsPerReview,
} from "./goals";
import { DEFAULT_NEW_CARDS_PER_DAY, FALLBACK_SECONDS_PER_REVIEW } from "./srs-defaults";

describe("buildDailyProgress", () => {
  const counts = { newIntro: 3, reviews: 12, watchMs: 25 * 60_000 };
  const defaultNew = { key: "newCards", done: 3, goal: DEFAULT_NEW_CARDS_PER_DAY };

  it("shows the default new-cards goal when no goals are set", () => {
    expect(buildDailyProgress(null, counts)).toEqual([defaultNew]);
    expect(buildDailyProgress({}, counts)).toEqual([defaultNew]);
  });

  it("emits one entry per set goal, in a stable order", () => {
    const p = buildDailyProgress(
      { newCardsPerDay: 15, maxReviewsPerDay: 50, watchMinutesPerDay: 30 },
      counts,
    );
    expect(p).toEqual([
      { key: "newCards", done: 3, goal: 15 },
      { key: "reviews", done: 12, goal: 50 },
      { key: "watchMinutes", done: 25, goal: 30 },
    ]);
  });

  it("includes only the optional goals that are set (new cards at the default)", () => {
    expect(buildDailyProgress({ maxReviewsPerDay: 50 }, counts)).toEqual([
      defaultNew,
      { key: "reviews", done: 12, goal: 50 },
    ]);
  });

  it("rounds watch minutes from milliseconds", () => {
    const p = buildDailyProgress({ watchMinutesPerDay: 30 }, { ...counts, watchMs: 90_000 });
    expect(p).toEqual([defaultNew, { key: "watchMinutes", done: 2, goal: 30 }]);
  });

  it("omits reviewMinutesPerDay — it's a budget, shown on the tomorrow projection", () => {
    expect(buildDailyProgress({ reviewMinutesPerDay: 20 }, counts)).toEqual([defaultNew]);
  });

  it("passes done through even when it exceeds the goal (UI clamps the bar)", () => {
    const p = buildDailyProgress({ newCardsPerDay: 2, maxReviewsPerDay: 5 }, counts);
    expect(p).toEqual([
      { key: "newCards", done: 3, goal: 2 },
      { key: "reviews", done: 12, goal: 5 },
    ]);
  });
});

describe("endOfTomorrow", () => {
  it("is local midnight two calendar days after today's midnight", () => {
    const now = new Date(2026, 9, 30, 23, 59);
    expect(endOfTomorrow(now)).toEqual(new Date(2026, 10, 1));
  });

  it("rolls over month and year ends", () => {
    expect(endOfTomorrow(new Date(2026, 11, 31, 8))).toEqual(new Date(2027, 0, 2));
  });
});

describe("estimateSecondsPerReview", () => {
  const at = (...offsetsS: number[]) => offsetsS.map((s) => new Date(1_700_000_000_000 + s * 1000));

  it("falls back with too little history", () => {
    expect(estimateSecondsPerReview([])).toBe(FALLBACK_SECONDS_PER_REVIEW);
    expect(estimateSecondsPerReview(at(0, 6, 12))).toBe(FALLBACK_SECONDS_PER_REVIEW);
  });

  it("uses the median in-session gap", () => {
    // 12 gaps of 6 s and one slow card of 40 s → median 6.
    const t = [0];
    for (let i = 0; i < 12; i++) t.push(t[t.length - 1]! + 6);
    t.push(t[t.length - 1]! + 40);
    expect(estimateSecondsPerReview(at(...t))).toBe(6);
  });

  it("drops breaks between sessions and sub-second double-submits", () => {
    const session = (start: number) => Array.from({ length: 7 }, (_, i) => start + i * 10);
    // two sessions of 6 gaps each, a day apart, plus a 0.2 s duplicate
    const t = [...session(0), ...session(86_400), 86_400 + 60.2];
    expect(estimateSecondsPerReview(at(...t))).toBe(10);
  });

  it("is order-independent", () => {
    const t = Array.from({ length: 15 }, (_, i) => i * 9);
    expect(estimateSecondsPerReview(at(...t.reverse()))).toBe(9);
  });

  it("falls back when every gap is a break", () => {
    const t = Array.from({ length: 30 }, (_, i) => i * 3600);
    expect(estimateSecondsPerReview(at(...t))).toBe(FALLBACK_SECONDS_PER_REVIEW);
  });
});

describe("buildTomorrowProjection", () => {
  it("caps pending new cards at the default when goals are unset", () => {
    const p = buildTomorrowProjection({ reviewsDue: 24, newPending: 50, goals: null, secondsPerReview: 8 });
    expect(p).toMatchObject({ reviews: 24, newCards: DEFAULT_NEW_CARDS_PER_DAY, total: 34 });
    expect(p.minutes).toBe(Math.ceil((34 * 8) / 60)); // 5
    expect(p.budgetMinutes).toBeNull();
    expect(p.overBudget).toBe(false);
  });

  it("honors explicit new-card and review caps", () => {
    const p = buildTomorrowProjection({
      reviewsDue: 300, newPending: 50,
      goals: { newCardsPerDay: 25, maxReviewsPerDay: 100 }, secondsPerReview: 8,
    });
    expect(p).toMatchObject({ reviews: 100, newCards: 25, total: 125 });
  });

  it("never projects more new cards than are pending", () => {
    const p = buildTomorrowProjection({ reviewsDue: 0, newPending: 3, goals: null, secondsPerReview: 8 });
    expect(p).toMatchObject({ newCards: 3, total: 3, minutes: 1 });
  });

  it("is zero minutes when nothing is due", () => {
    const p = buildTomorrowProjection({ reviewsDue: 0, newPending: 0, goals: null, secondsPerReview: 8 });
    expect(p).toMatchObject({ total: 0, minutes: 0, overBudget: false });
  });

  it("flags going over the review-minutes budget", () => {
    const over = buildTomorrowProjection({
      reviewsDue: 300, newPending: 0, goals: { reviewMinutesPerDay: 20 }, secondsPerReview: 8,
    });
    expect(over).toMatchObject({ minutes: 40, budgetMinutes: 20, overBudget: true });
    const within = buildTomorrowProjection({
      reviewsDue: 100, newPending: 0, goals: { reviewMinutesPerDay: 20 }, secondsPerReview: 8,
    });
    expect(within).toMatchObject({ minutes: 14, overBudget: false });
  });
});
