import { describe, it, expect } from "vitest";
import { estimateLevel, MIN_RANKED_WORDS } from "./level";

const ranks = (n: number, rank: number) => Array(n).fill(rank) as number[];

describe("estimateLevel", () => {
  it("returns null when too few ranked words to judge", () => {
    expect(estimateLevel([])).toBeNull();
    expect(estimateLevel(ranks(MIN_RANKED_WORDS - 1, 100))).toBeNull();
  });

  it("ignores unranked (null) words for the sample-size check", () => {
    const nulls = Array(50).fill(null) as null[];
    expect(estimateLevel([...nulls, ...ranks(MIN_RANKED_WORDS - 1, 100)])).toBeNull();
  });

  it("classifies common vocabulary as beginner", () => {
    expect(estimateLevel(ranks(30, 2000))).toBe("beginner");
  });

  it("classifies mid-frequency vocabulary as intermediate", () => {
    expect(estimateLevel(ranks(30, 9000))).toBe("intermediate");
  });

  it("classifies rare vocabulary as advanced", () => {
    expect(estimateLevel(ranks(30, 30000))).toBe("advanced");
  });

  it("uses the median, so a rare tail does not dominate", () => {
    // 21 common words + 9 very rare ones → median stays common.
    expect(estimateLevel([...ranks(21, 1500), ...ranks(9, 40000)])).toBe("beginner");
  });
});
