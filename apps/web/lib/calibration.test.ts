import { describe, it, expect } from "vitest";
import { CALIBRATION_MIN_SAMPLE, formatCalibration, suggestLikelyWeight, summarizeCalibration, type CalibrationSample } from "./calibration";
import { LIKELY_WEIGHT } from "./known-words";

const many = (n: number, s: CalibrationSample) => Array.from({ length: n }, () => s);

describe("calibration summary", () => {
  it("rates per tier × source; OK = grade ≥ 3, recalled = grade ≥ 2", () => {
    const rows = summarizeCalibration([
      { tier: "likely", source: "exact", grade: 3 },
      { tier: "likely", source: "exact", grade: 2 },
      { tier: "likely", source: "exact", grade: 1 },
      { tier: "likely", source: "exact", grade: 4 },
      { tier: "unknown", source: "reconstructed", grade: 1 },
    ]);
    const likely = rows.find((r) => r.tier === "likely" && r.source === "exact")!;
    expect(likely).toMatchObject({ words: 4, okRate: 0.5, passRate: 0.75 });
    expect(rows.find((r) => r.tier === "confirmed" && r.source === "exact")!.okRate).toBeNull();
    expect(rows).toHaveLength(6);
    expect(formatCalibration(rows)).toContain("likely");
  });

  it("suggests the measured weight only with enough exact samples", () => {
    const few = summarizeCalibration(many(CALIBRATION_MIN_SAMPLE - 1, { tier: "likely", source: "exact", grade: 3 }));
    expect(suggestLikelyWeight(few)).toMatchObject({ weight: LIKELY_WEIGHT, basis: "default" });
    const enough = summarizeCalibration([
      ...many(24, { tier: "likely", source: "exact", grade: 3 }),
      ...many(16, { tier: "likely", source: "exact", grade: 1 }),
      ...many(100, { tier: "likely", source: "reconstructed", grade: 1 }), // ignored
    ]);
    expect(suggestLikelyWeight(enough)).toEqual({ weight: 0.6, basis: "measured", n: 40 });
  });
});
