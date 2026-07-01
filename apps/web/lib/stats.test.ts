import { describe, it, expect } from "vitest";
import { computeStreaks, heatLevel } from "./stats";

describe("computeStreaks", () => {
  const key = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  it("is zero with no activity", () => {
    expect(computeStreaks([])).toEqual({ current: 0, best: 0 });
  });

  it("counts a run ending today as the current streak", () => {
    expect(computeStreaks([key(0), key(1), key(2)])).toEqual({ current: 3, best: 3 });
  });

  it("counts a run ending yesterday as still current", () => {
    expect(computeStreaks([key(1), key(2)])).toEqual({ current: 2, best: 2 });
  });

  it("drops the current streak when the last active day is >1 day ago", () => {
    const { current } = computeStreaks([key(3), key(4)]);
    expect(current).toBe(0);
  });

  it("reports best streak independent of the current one", () => {
    // Long past run of 4, then a gap, then 1 recent day.
    const { current, best } = computeStreaks([
      key(10), key(9), key(8), key(7), // best = 4
      key(0), // current = 1
    ]);
    expect(best).toBe(4);
    expect(current).toBe(1);
  });

  it("dedupes repeated days", () => {
    expect(computeStreaks([key(0), key(0), key(1)])).toEqual({ current: 2, best: 2 });
  });
});

describe("heatLevel", () => {
  it("maps review counts to 0-4 buckets", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(4)).toBe(1);
    expect(heatLevel(5)).toBe(2);
    expect(heatLevel(11)).toBe(2);
    expect(heatLevel(12)).toBe(3);
    expect(heatLevel(24)).toBe(3);
    expect(heatLevel(25)).toBe(4);
    expect(heatLevel(999)).toBe(4);
  });
});
