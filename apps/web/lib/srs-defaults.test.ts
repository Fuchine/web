import { describe, it, expect } from "vitest";
import {
  DEFAULT_NEW_CARDS_PER_DAY, effectiveNewCardsPerDay, reviewMinutes, tomorrowSummary,
} from "./srs-defaults";

describe("effectiveNewCardsPerDay", () => {
  it("defaults to 10 when the user never chose a value", () => {
    expect(DEFAULT_NEW_CARDS_PER_DAY).toBe(10);
    expect(effectiveNewCardsPerDay(null)).toBe(10);
    expect(effectiveNewCardsPerDay(undefined)).toBe(10);
    expect(effectiveNewCardsPerDay({})).toBe(10);
    expect(effectiveNewCardsPerDay({ maxReviewsPerDay: 100 })).toBe(10);
  });

  it("never overrides an explicit value", () => {
    expect(effectiveNewCardsPerDay({ newCardsPerDay: 20 })).toBe(20);
    expect(effectiveNewCardsPerDay({ newCardsPerDay: 1 })).toBe(1);
  });
});

describe("reviewMinutes", () => {
  it("rounds up, with at least a minute for any work and 0 for none", () => {
    expect(reviewMinutes(0, 8)).toBe(0);
    expect(reviewMinutes(1, 8)).toBe(1);
    expect(reviewMinutes(34, 8)).toBe(5);
    expect(reviewMinutes(300, 8)).toBe(40);
  });
});

describe("tomorrowSummary", () => {
  const base = { reviews: 24, newCards: 10, total: 34, minutes: 5, secondsPerReview: 8, budgetMinutes: null, overBudget: false };

  it("formats the headline", () => {
    expect(tomorrowSummary(base).headline).toBe("Tomorrow: 34 reviews · ~5 min");
    expect(tomorrowSummary({ ...base, reviews: 1, newCards: 0, total: 1, minutes: 1 }).headline)
      .toBe("Tomorrow: 1 review · ~1 min");
    expect(tomorrowSummary({ ...base, reviews: 0, newCards: 0, total: 0, minutes: 0 }).headline)
      .toBe("Tomorrow: nothing due");
  });

  it("adds a budget note only when a budget is set", () => {
    expect(tomorrowSummary(base).budget).toBeNull();
    expect(tomorrowSummary({ ...base, budgetMinutes: 20 }).budget).toBe("within your 20 min budget");
    expect(tomorrowSummary({ ...base, minutes: 40, budgetMinutes: 20, overBudget: true }).budget)
      .toBe("over your 20 min budget");
  });

  it("explains the breakdown and pace in the detail", () => {
    const d = tomorrowSummary(base).detail;
    expect(d).toContain("24 due + 10 new");
    expect(d).toContain("~8 s per card");
  });
});
