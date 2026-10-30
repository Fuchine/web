import { describe, it, expect } from "vitest";
import type { Token } from "@fuchine/db";
import { countCoverageWords, isCoverageToken } from "@fuchine/nlp";
import {
  COVERAGE_MIN_TOKENS,
  LIKELY_MIN_VIEWS,
  LIKELY_VIEWS_PER_CLICK,
  LIKELY_WEIGHT,
  LOOKUP_DECAY_DAYS,
  applyCountDeltas,
  coverageFromTierCounts,
  diffCounts,
  emptyTierCounts,
  signalsFromRow,
  tierCountsFromWords,
  wordTier,
  type WordSignals,
  type WordTier,
} from "./known-words";
import { wordStatusFromStats } from "./word-status";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const s = (o: Partial<WordSignals>): WordSignals => ({ views: 0, clicks: 0, reviewsOk: 0, reviewsTotal: 0, lastReviewOk: null, lastClickedAt: null, ...o });

describe("wordTier — signals", () => {
  it("no stats row → unknown", () => {
    expect(wordTier(null, null, NOW)).toBe("unknown");
    expect(wordTier(s({}), null, NOW)).toBe("unknown");
  });

  it("confirmed: a correct review and the most recent review OK", () => {
    expect(wordTier(s({ reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true }), null, NOW)).toBe("confirmed");
    expect(wordTier(s({ reviewsOk: 3, reviewsTotal: 5, lastReviewOk: true }), null, NOW)).toBe("confirmed");
  });

  it("a failed last review removes the confirmation but does not force unknown", () => {
    expect(wordTier(s({ reviewsOk: 3, reviewsTotal: 4, lastReviewOk: false }), null, NOW)).toBe("unknown");
    // …still likely when seen often without lookup (a sentence fails for one word, not all)
    expect(wordTier(s({ reviewsOk: 3, reviewsTotal: 4, lastReviewOk: false, views: 40 }), null, NOW)).toBe("likely");
  });

  it("legacy rows (last outcome unknown) fall back to OK ≥ failed", () => {
    expect(wordTier(s({ reviewsOk: 2, reviewsTotal: 3 }), null, NOW)).toBe("confirmed");
    expect(wordTier(s({ reviewsOk: 1, reviewsTotal: 3 }), null, NOW)).toBe("unknown");
  });

  it(`likely: ≥ ${LIKELY_MIN_VIEWS} views and ≤ 1 lookup per ${LIKELY_VIEWS_PER_CLICK} views`, () => {
    expect(wordTier(s({ views: LIKELY_MIN_VIEWS }), null, NOW)).toBe("likely");
    expect(wordTier(s({ views: LIKELY_MIN_VIEWS - 1 }), null, NOW)).toBe("unknown");
    // the v1 rule (views ≥ 5 ⇒ known) no longer counts
    expect(wordTier(s({ views: 5 }), null, NOW)).toBe("unknown");
    expect(wordTier(s({ views: 20, clicks: 2, lastClickedAt: daysAgo(60) }), null, NOW)).toBe("likely");
    expect(wordTier(s({ views: 20, clicks: 3, lastClickedAt: daysAgo(60) }), null, NOW)).toBe("unknown");
  });

  it(`a lookup in the last ${LOOKUP_DECAY_DAYS} days demotes likely → unknown, then decays`, () => {
    const base = { views: 100, clicks: 1 };
    expect(wordTier(s({ ...base, lastClickedAt: daysAgo(1) }), null, NOW)).toBe("unknown");
    expect(wordTier(s({ ...base, lastClickedAt: daysAgo(LOOKUP_DECAY_DAYS - 0.01) }), null, NOW)).toBe("unknown");
    expect(wordTier(s({ ...base, lastClickedAt: daysAgo(LOOKUP_DECAY_DAYS) }), null, NOW)).toBe("likely");
    // pre-0021 clicks have no timestamp: only the ratio applies
    expect(wordTier(s({ ...base, lastClickedAt: null }), null, NOW)).toBe("likely");
  });

  it("a recent lookup does not demote a confirmed word", () => {
    expect(wordTier(s({ reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true, clicks: 5, lastClickedAt: daysAgo(0) }), null, NOW)).toBe("confirmed");
  });
});

describe("wordTier — manual overrides (saved_words.status)", () => {
  it('"known" ⇒ confirmed, whatever the signals', () => {
    expect(wordTier(null, "known", NOW)).toBe("confirmed");
    expect(wordTier(s({ clicks: 9, lastClickedAt: daysAgo(0) }), "known", NOW)).toBe("confirmed");
  });
  it('"new" (Mark as unknown) ⇒ unknown, whatever the signals', () => {
    expect(wordTier(s({ reviewsOk: 5, reviewsTotal: 5, lastReviewOk: true, views: 500 }), "new", NOW)).toBe("unknown");
  });
  it('"learning" caps at likely and never raises', () => {
    expect(wordTier(s({ reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true }), "learning", NOW)).toBe("likely");
    expect(wordTier(s({ views: 50 }), "learning", NOW)).toBe("likely");
    expect(wordTier(s({ views: 1 }), "learning", NOW)).toBe("unknown");
  });
});

describe("wordStatusFromStats — the player façade", () => {
  it("maps unknown/likely/confirmed to the player's unknown/seen/known", () => {
    expect(wordStatusFromStats(null)).toBe("unknown");
    expect(wordStatusFromStats(s({ views: 50 }), null, NOW)).toBe("seen");
    expect(wordStatusFromStats(s({ reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true }), null, NOW)).toBe("known");
    expect(wordStatusFromStats(null, "known", NOW)).toBe("known");
  });
  it("signalsFromRow: an all-null left join is no row", () => {
    expect(signalsFromRow({ views: null, clicks: null, reviewsOk: null, reviewsTotal: null, lastReviewOk: null, lastClickedAt: null })).toBeNull();
  });
});

const tok = (surface: string, pos: string, wordEntryId: string | null, posDetail?: string): Token => ({
  surface, lemma: surface, reading: null, romaji: null, pos, wordEntryId, ...(posDetail ? { posDetail } : {}),
});

describe("coverage exclusions (isCoverageToken)", () => {
  it("counts content words, particles and auxiliaries", () => {
    expect(isCoverageToken(tok("食べ", "動詞", "w1"))).toBe(true);
    expect(isCoverageToken(tok("は", "助詞", "w2"))).toBe(true);
    expect(isCoverageToken(tok("ます", "助動詞", "w3"))).toBe(true);
  });
  it("excludes tokens without a dictionary entry", () => {
    expect(isCoverageToken(tok("ゆうた", "名詞", null))).toBe(false);
  });
  it("excludes symbols, interjections, fillers and その他 by POS", () => {
    for (const pos of ["記号", "感動詞", "フィラー", "その他"]) expect(isCoverageToken(tok("x", pos, "w"))).toBe(false);
  });
  it("excludes proper nouns and numerals by POS detail", () => {
    expect(isCoverageToken(tok("東京", "名詞", "w", "固有名詞"))).toBe(false);
    expect(isCoverageToken(tok("三", "名詞", "w", "数"))).toBe(false);
    expect(isCoverageToken(tok("東京", "名詞", "w", "一般"))).toBe(true);
  });
  it("excludes numeral, punctuation and Latin-only surfaces (old tokens lack POS detail)", () => {
    expect(isCoverageToken(tok("２０２６", "名詞", "w"))).toBe(false);
    expect(isCoverageToken(tok("十", "名詞", "w"))).toBe(false);
    expect(isCoverageToken(tok("、", "名詞", "w"))).toBe(false);
    expect(isCoverageToken(tok("ｗｗｗ", "名詞", "w"))).toBe(false);
    expect(isCoverageToken(tok("YouTube", "名詞", "w"))).toBe(false);
    expect(isCoverageToken(tok("十分", "名詞", "w"))).toBe(true); // じゅうぶん is a word
  });
  it("excludes entries whose every JMdict POS is int / n-pr / num", () => {
    expect(isCoverageToken(tok("はい", "名詞", "w"), "ja", "int")).toBe(false);
    expect(isCoverageToken(tok("ああ", "副詞", "w"), "ja", "adv,int")).toBe(true);
  });
  it("countCoverageWords counts running occurrences (repeats in a line count)", () => {
    const line = [tok("猫", "名詞", "cat"), tok("と", "助詞", "to"), tok("猫", "名詞", "cat"), tok("。", "記号", null)];
    expect([...countCoverageWords([line, [tok("猫", "名詞", "cat")]])]).toEqual([["cat", 3], ["to", 1]]);
  });
});

const counts = (c: Partial<Record<WordTier, [number, number]>>) => {
  const out = emptyTierCounts();
  for (const [t, [tokens, words]] of Object.entries(c) as [WordTier, [number, number]][]) out[t] = { tokens, words };
  return out;
};

describe("coverage math", () => {
  it("headline = confirmed + LIKELY_WEIGHT·likely over running tokens; band = confirmed … confirmed+likely", () => {
    const cov = coverageFromTierCounts(counts({ confirmed: [890, 300], likely: [60, 40], unknown: [50, 160] }))!;
    expect(cov.low).toBe(89);
    expect(cov.high).toBe(95);
    expect(cov.headline).toBe(Math.round(89 + 6 * LIKELY_WEIGHT));
    expect(cov.low).toBeLessThanOrEqual(cov.headline);
    expect(cov.headline).toBeLessThanOrEqual(cov.high);
    expect(cov.uniqueLow).toBe(60);
    expect(cov.uniqueHigh).toBe(68);
    expect(cov.tokens).toBe(1000);
    expect(cov.words).toBe(500);
  });
  it("no number below the minimum countable tokens / words", () => {
    expect(coverageFromTierCounts(counts({ confirmed: [COVERAGE_MIN_TOKENS - 1, 20] }))).toBeNull();
    expect(coverageFromTierCounts(counts({ confirmed: [500, 9] }))).toBeNull();
    expect(coverageFromTierCounts(counts({ confirmed: [COVERAGE_MIN_TOKENS, 10] }))).not.toBeNull();
  });
  it("a band collapses when nothing is likely", () => {
    const cov = coverageFromTierCounts(counts({ confirmed: [70, 20], unknown: [30, 20] }))!;
    expect([cov.low, cov.headline, cov.high]).toEqual([70, 70, 70]);
  });

  it("token corrections apply as deltas (a merge removes two words and adds one)", () => {
    // shared: マー (unknown, 2×), ク (unknown, 1×), マーク (absent); the user merges one マー|ク → マーク (confirmed)
    const c = counts({ unknown: [3, 2], confirmed: [97, 20] });
    const d = diffCounts(new Map([["ma", 1], ["ku", 1]]), new Map([["mark", 1]]));
    applyCountDeltas(c, d, new Map([["ma", 2], ["ku", 1]]), new Map<string, WordTier>([["ma", "unknown"], ["ku", "unknown"], ["mark", "confirmed"]]));
    expect(c.unknown).toEqual({ tokens: 1, words: 1 }); // ク gone, マー down to 1
    expect(c.confirmed).toEqual({ tokens: 98, words: 21 }); // マーク entered
  });
});

/**
 * The jpdb example (PESQUISA_MERCADO §2): on CROSS†CHANNEL, 90% of the
 * running text ⇔ ≈34% of the unique words, 95% ⇔ ≈55%. A frequency-banded
 * fixture with the same shape: 1000 distinct words, 10 000 running tokens.
 *  A: 340 words (the most frequent) → 9000 tokens
 *  B: 210 words → 500 tokens
 *  C: 450 words (mostly hapax) → 500 tokens
 */
function jpdbFixture() {
  const words: { id: string; occurrences: number; band: "A" | "B" | "C" }[] = [];
  const spread = (band: "A" | "B" | "C", n: number, total: number) => {
    // Zipf-ish inside the band, exact total.
    const weights = Array.from({ length: n }, (_, i) => 1 / (i + 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    const occ = weights.map((w) => Math.max(1, Math.floor((w / sum) * total)));
    let rest = total - occ.reduce((a, b) => a + b, 0);
    for (let i = 0; rest !== 0; i = (i + 1) % n) { const step = rest > 0 ? 1 : (occ[i]! > 1 ? -1 : 0); occ[i]! += step; rest -= step; }
    occ.forEach((o, i) => words.push({ id: `${band}${i}`, occurrences: o, band }));
  };
  spread("A", 340, 9000);
  spread("B", 210, 500);
  spread("C", 450, 500);
  return words;
}

describe("before/after on the jpdb fixture", () => {
  const words = jpdbFixture();
  it("has the jpdb shape", () => {
    expect(words.length).toBe(1000);
    expect(words.reduce((a, w) => a + w.occurrences, 0)).toBe(10_000);
  });

  it("knowing the top 34% of unique words = 90% of running words (55% → 95%)", () => {
    const knowA = coverageFromTierCounts(tierCountsFromWords(words.map((w) => ({ occurrences: w.occurrences, tier: w.band === "A" ? "confirmed" : "unknown" }))))!;
    expect([knowA.unique, knowA.headline]).toEqual([34, 90]);
    const knowAB = coverageFromTierCounts(tierCountsFromWords(words.map((w) => ({ occurrences: w.occurrences, tier: w.band === "C" ? "unknown" : "confirmed" }))))!;
    expect([knowAB.unique, knowAB.headline]).toEqual([55, 95]);
  });

  it("the converse: 90% of unique words known can be ≈34% of the running words", () => {
    // Knowing all of B and C plus the 240 *least* frequent words of A, missing A's top 100.
    const aSorted = words.filter((w) => w.band === "A").sort((x, y) => y.occurrences - x.occurrences);
    const missing = new Set(aSorted.slice(0, 100).map((w) => w.id));
    const cov = coverageFromTierCounts(tierCountsFromWords(words.map((w) => ({ occurrences: w.occurrences, tier: missing.has(w.id) ? "unknown" : "confirmed" }))))!;
    expect(cov.unique).toBe(90);
    expect(cov.headline).toBeLessThan(40);
    expect(cov.headline).toBeGreaterThan(25);
  });
});
