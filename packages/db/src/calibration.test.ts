import { describe, it, expect } from "vitest";
import {
  calibrateFromCounts,
  CALIBRATION_MIN_SAMPLE,
  LIKELY_OK_HIGH,
  LIKELY_OK_LOW,
  measuredLikelyWeight,
  suggestLikelyMinViews,
} from "./calibration";
import { LIKELY_MIN_VIEWS, paramsFromStored, wordTier, wordTierSqlFor } from "./known-words";

const now = new Date("2026-10-30T04:17:00Z");

describe("calibration math", () => {
  it("measures the likely weight as P(first review OK | likely), clamped", () => {
    expect(measuredLikelyWeight(0.8333)).toBe(0.83);
    expect(measuredLikelyWeight(0.05)).toBe(0.3);
    expect(measuredLikelyWeight(1)).toBe(1);
  });

  it("steps LIKELY_MIN_VIEWS with hysteresis", () => {
    expect(suggestLikelyMinViews(LIKELY_OK_LOW - 0.01, 10)).toBe(12); // too optimistic → stricter
    expect(suggestLikelyMinViews(LIKELY_OK_HIGH + 0.01, 10)).toBe(9); // conservative → looser
    expect(suggestLikelyMinViews(0.8, 10)).toBe(10); // inside the band → keep
    expect(suggestLikelyMinViews(0.1, 30)).toBe(30); // clamped
    expect(suggestLikelyMinViews(0.99, 5)).toBe(5);
  });

  it(`writes nothing below ${CALIBRATION_MIN_SAMPLE} samples`, () => {
    expect(calibrateFromCounts({ n: CALIBRATION_MIN_SAMPLE - 1, ok: 29 }, 10, "instance", now)).toBeNull();
    const c = calibrateFromCounts({ n: CALIBRATION_MIN_SAMPLE, ok: 18 }, 10, "instance", now);
    expect(c).toEqual({
      likelyWeight: 0.6, likelyMinViews: 12, samples: 30, okRate: 0.6, scope: "instance", computedAt: now.toISOString(),
    });
  });

  it("does not ratchet the threshold again on unchanged data", () => {
    const again = calibrateFromCounts({ n: 30, ok: 18 }, 12, "instance", now, CALIBRATION_MIN_SAMPLE, 30);
    expect(again?.likelyMinViews).toBe(12);
    const fresh = calibrateFromCounts({ n: 31, ok: 18 }, 12, "instance", now, CALIBRATION_MIN_SAMPLE, 30);
    expect(fresh?.likelyMinViews).toBe(14);
  });
});

describe("calibrated params in the tier rule", () => {
  it("validates stored params and rejects out-of-range ones", () => {
    expect(paramsFromStored({ likelyWeight: 0.8, likelyMinViews: 12 }, "instance")).toEqual({ likelyWeight: 0.8, likelyMinViews: 12, source: "instance" });
    expect(paramsFromStored({ likelyWeight: 1.5, likelyMinViews: 12 }, "user")).toBeNull();
    expect(paramsFromStored({ likelyWeight: 0.8, likelyMinViews: 2 }, "user")).toBeNull();
    expect(paramsFromStored({ likelyWeight: 0.8, likelyMinViews: 12.5 }, "user")).toBeNull();
    expect(paramsFromStored(null, "user")).toBeNull();
  });

  it("the likely threshold follows minViews (pure and SQL)", () => {
    const s = { views: 11, clicks: 0, reviewsOk: 0 };
    expect(wordTier(s, null, now)).toBe("likely");
    expect(wordTier(s, null, now, 12)).toBe("unknown");
    expect(LIKELY_MIN_VIEWS).toBe(10);
    // The SQL inlines the integer threshold (and ignores junk).
    const chunks = (q: ReturnType<typeof wordTierSqlFor>) =>
      JSON.stringify((q as unknown as { queryChunks: unknown[] }).queryChunks);
    expect(chunks(wordTierSqlFor(12))).toContain(">= ");
    expect(chunks(wordTierSqlFor(12))).toContain("12");
    expect(chunks(wordTierSqlFor(Number.NaN))).toContain("10");
  });
});
