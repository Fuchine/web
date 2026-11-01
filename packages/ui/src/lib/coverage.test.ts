import { describe, it, expect } from "vitest";
import { coverageTooltip, coverageZone, formatCoverage, formatCoverageBand } from "./coverage";

describe("coverage display", () => {
  it("formats the headline with its band", () => {
    expect(formatCoverage({ headline: 93, low: 89, high: 95 })).toBe("93% (89–95)");
    expect(formatCoverage({ headline: 70, low: 70, high: 70 })).toBe("70%");
    expect(formatCoverageBand({ headline: 70, low: 70, high: 70 })).toBe("");
  });
  it("maps the 80/90/95/98 thresholds", () => {
    expect(coverageZone(99)).toBe("Comfortable");
    expect(coverageZone(98)).toBe("Comfortable");
    expect(coverageZone(96)).toBe("Adequate");
    expect(coverageZone(92)).toBe("Challenging");
    expect(coverageZone(85)).toBe("Hard");
    expect(coverageZone(40)).toBe("Too hard for now");
  });
  it("tooltip explains tiers and thresholds", () => {
    const t = coverageTooltip({ headline: 93, low: 89, high: 95, unique: 71 });
    expect(t).toContain("93%");
    expect(t).toContain("89–95%");
    expect(t).toContain("confirmed");
    expect(t).toContain("Unique words: 71%");
    expect(t).toMatch(/80%.*90%.*95%.*98%/s);
  });
});
