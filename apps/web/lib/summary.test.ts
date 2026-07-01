import { describe, it, expect } from "vitest";
import { resolveSessionStart } from "./summary";

// Fixed base so comparisons are deterministic (no Date.now() drift across calls).
const BASE = new Date("2026-06-30T20:00:00.000Z").getTime();
const at = (minsAgo: number) => new Date(BASE - minsAgo * 60_000);

describe("resolveSessionStart", () => {
  it("returns null with no reviews and no explicit since", () => {
    expect(resolveSessionStart([])).toBeNull();
  });

  it("honors an explicit since over sessionization", () => {
    const since = at(500);
    expect(resolveSessionStart([at(1), at(2)], since)).toBe(since);
  });

  it("ignores an invalid explicit since and falls back to sessionization", () => {
    const start = resolveSessionStart([at(5), at(10)], new Date("not-a-date"));
    expect(start).toEqual(at(10));
  });

  it("groups reviews within the 30-min gap into one session", () => {
    // 0, 10, 25 min ago — all within 30 min of the previous → session start = 25 min ago.
    const start = resolveSessionStart([at(0), at(10), at(25)]);
    expect(start).toEqual(at(25));
  });

  it("stops at a gap larger than 30 minutes", () => {
    // 0, 5 min ago, then a jump to 90 min ago → session start = 5 min ago.
    const start = resolveSessionStart([at(0), at(5), at(90), at(95)]);
    expect(start).toEqual(at(5));
  });

  it("handles unsorted input", () => {
    const start = resolveSessionStart([at(10), at(0), at(25)]);
    expect(start).toEqual(at(25));
  });
});
