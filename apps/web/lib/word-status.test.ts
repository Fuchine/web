import { describe, it, expect } from "vitest";
import { KNOWN_MIN_VIEWS, wordStatusFromStats } from "./word-status";

const s = (o: Partial<{ views: number; clicks: number; reviewsOk: number }>) => ({ views: 0, clicks: 0, reviewsOk: 0, ...o });

describe("wordStatusFromStats", () => {
  it("no stats row → unknown", () => {
    expect(wordStatusFromStats(null)).toBe("unknown");
    expect(wordStatusFromStats(s({}))).toBe("unknown");
  });
  it("a correct review or enough views → known", () => {
    expect(wordStatusFromStats(s({ reviewsOk: 1 }))).toBe("known");
    expect(wordStatusFromStats(s({ views: KNOWN_MIN_VIEWS }))).toBe("known");
  });
  it("any view or click below the bar → seen", () => {
    expect(wordStatusFromStats(s({ views: KNOWN_MIN_VIEWS - 1 }))).toBe("seen");
    expect(wordStatusFromStats(s({ clicks: 1 }))).toBe("seen");
  });
});
