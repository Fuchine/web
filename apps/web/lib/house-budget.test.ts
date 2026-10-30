import { describe, expect, test } from "vitest";
import { secondsUntilLocalMidnight } from "./house-budget";

describe("secondsUntilLocalMidnight", () => {
  test("counts down to the next local midnight", () => {
    expect(secondsUntilLocalMidnight(new Date(2026, 9, 30, 23, 0, 0))).toBe(3600);
  });
  test("is never zero", () => {
    expect(secondsUntilLocalMidnight(new Date(2026, 9, 30, 23, 59, 59, 999))).toBe(1);
  });
});
