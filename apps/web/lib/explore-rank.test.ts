import { describe, it, expect } from "vitest";
import {
  bandFit,
  DEFAULT_BAND,
  explainScore,
  exploreScore,
  NARROW_WEIGHT,
  novelty,
  NOVELTY_MIN_WORDS,
  NOVELTY_WEIGHT,
  parseBand,
  rankCandidates,
  type RankInput,
} from "./explore-rank";
import { freshnessAction, MIN_REFRESH_INTERVAL_MS, STALE_AFTER_MS, starterChannels } from "./explore";

const c = (videoId: string, coverage: number, newCommonWords = 0, narrowFrom: string | null = null): RankInput => ({
  videoId, coverage, newCommonWords, narrowFrom,
});

describe("band handling", () => {
  it("parses presets and rejects malformed or out-of-range bands", () => {
    expect(parseBand("85-90")).toEqual({ lo: 85, hi: 90 });
    expect(parseBand(undefined)).toEqual(DEFAULT_BAND);
    expect(parseBand("95-90")).toEqual(DEFAULT_BAND); // inverted
    expect(parseBand("90-99")).toEqual(DEFAULT_BAND); // above the 98% cut
    expect(parseBand("10-20")).toEqual(DEFAULT_BAND); // below the floor
    expect(parseBand("9x-95")).toEqual(DEFAULT_BAND);
  });

  it("fit is 1 at the center, 0.5 at the edges, 0 ten points outside", () => {
    expect(bandFit(92.5, DEFAULT_BAND)).toBe(1);
    expect(bandFit(90, DEFAULT_BAND)).toBe(0.5);
    expect(bandFit(95, DEFAULT_BAND)).toBe(0.5);
    expect(bandFit(85, DEFAULT_BAND)).toBeCloseTo(0.25);
    expect(bandFit(80, DEFAULT_BAND)).toBe(0);
    expect(bandFit(40, DEFAULT_BAND)).toBe(0);
    // inside beats outside, closer beats farther
    expect(bandFit(91, DEFAULT_BAND)).toBeGreaterThan(bandFit(89, DEFAULT_BAND));
    expect(bandFit(93, DEFAULT_BAND)).toBeGreaterThan(bandFit(94, DEFAULT_BAND));
  });
});

describe("score", () => {
  it("novelty needs k unknown common words and saturates", () => {
    expect(novelty(NOVELTY_MIN_WORDS - 1)).toBe(0);
    expect(novelty(NOVELTY_MIN_WORDS)).toBeGreaterThan(0);
    expect(novelty(1000)).toBe(1);
  });

  it("combines fit + weighted novelty + narrow viewing", () => {
    const s = exploreScore(c("a", 92.5, 1000, "Some video"), DEFAULT_BAND);
    expect(s).toEqual({ fit: 1, novelty: 1, narrow: 1, score: 1 + NOVELTY_WEIGHT + NARROW_WEIGHT });
  });

  it("orders by closeness to the band center first; boosts break near-ties", () => {
    const ranked = rankCandidates([
      c("far", 80), c("edge", 95), c("center", 92.5), c("near", 91.5),
    ], DEFAULT_BAND).map((r) => r.videoId);
    expect(ranked).toEqual(["center", "near", "edge", "far"]);

    // A same-channel video under one point farther from the center outranks a plain one…
    const boosted = rankCandidates([c("plain", 92.5), c("channel", 93.4, 0, "Ep. 1")], DEFAULT_BAND).map((r) => r.videoId);
    expect(boosted).toEqual(["channel", "plain"]);
    // …but not one ten points out of the band.
    const capped = rankCandidates([c("plain", 92.5), c("channel", 83, 50, "Ep. 1")], DEFAULT_BAND).map((r) => r.videoId);
    expect(capped).toEqual(["plain", "channel"]);
  });

  it("drops already-covered videos (≥ 98%)", () => {
    expect(rankCandidates([c("done", 98), c("ok", 97.9)], DEFAULT_BAND).map((r) => r.videoId)).toEqual(["ok"]);
  });

  it("explains the score on the card", () => {
    expect(explainScore(c("a", 94.2, 12, "Morning walk"))).toBe("94% covered · 12 new common words · same channel as “Morning walk”");
    expect(explainScore(c("a", 91, 1))).toBe("91% covered · 1 new common word");
    expect(explainScore(c("a", 91))).toBe("91% covered");
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo);
  it("computes on first visit, refreshes when stale or changed, throttles", () => {
    expect(freshnessAction({ rows: 0, computedAt: null, changedSince: true }, now)).toBe("compute");
    expect(freshnessAction({ rows: 5, computedAt: at(60_000), changedSince: true }, now)).toBe("fresh"); // throttled
    expect(freshnessAction({ rows: 5, computedAt: at(MIN_REFRESH_INTERVAL_MS + 1), changedSince: true }, now)).toBe("refresh");
    expect(freshnessAction({ rows: 5, computedAt: at(MIN_REFRESH_INTERVAL_MS + 1), changedSince: false }, now)).toBe("fresh");
    expect(freshnessAction({ rows: 5, computedAt: at(STALE_AFTER_MS + 1), changedSince: false }, now)).toBe("refresh");
  });
});

describe("starter channels", () => {
  it("ships 10–20 curated channels with a level and a YouTube search link", () => {
    const list = starterChannels();
    expect(list.length).toBeGreaterThanOrEqual(10);
    expect(list.length).toBeLessThanOrEqual(20);
    for (const ch of list) {
      expect(["beginner", "intermediate", "advanced"]).toContain(ch.level);
      expect(ch.url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    }
    expect(list.map((c) => c.name)).toContain("Comprehensible Japanese");
  });
});
