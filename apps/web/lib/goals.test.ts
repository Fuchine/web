import { describe, it, expect } from "vitest";
import { buildDailyProgress } from "./goals";

describe("buildDailyProgress", () => {
  const counts = { newIntro: 3, reviews: 12, watchMs: 25 * 60_000 };

  it("returns nothing when no goals are set", () => {
    expect(buildDailyProgress(null, counts)).toEqual([]);
    expect(buildDailyProgress({}, counts)).toEqual([]);
  });

  it("emits one entry per set goal, in a stable order", () => {
    const p = buildDailyProgress(
      { newCardsPerDay: 10, maxReviewsPerDay: 50, watchMinutesPerDay: 30 },
      counts,
    );
    expect(p).toEqual([
      { key: "newCards", done: 3, goal: 10 },
      { key: "reviews", done: 12, goal: 50 },
      { key: "watchMinutes", done: 25, goal: 30 },
    ]);
  });

  it("includes only the goals that are set", () => {
    expect(buildDailyProgress({ maxReviewsPerDay: 50 }, counts)).toEqual([
      { key: "reviews", done: 12, goal: 50 },
    ]);
  });

  it("rounds watch minutes from milliseconds", () => {
    const p = buildDailyProgress({ watchMinutesPerDay: 30 }, { ...counts, watchMs: 90_000 });
    expect(p).toEqual([{ key: "watchMinutes", done: 2, goal: 30 }]);
  });

  it("omits reviewMinutesPerDay — no per-review time is tracked yet", () => {
    expect(buildDailyProgress({ reviewMinutesPerDay: 20 }, counts)).toEqual([]);
  });

  it("passes done through even when it exceeds the goal (UI clamps the bar)", () => {
    const p = buildDailyProgress({ maxReviewsPerDay: 5 }, counts);
    expect(p).toEqual([{ key: "reviews", done: 12, goal: 5 }]);
  });
});
