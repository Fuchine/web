// Explore ranking (T3.10) — pure and client-safe, unit-tested. The DB side
// (candidate pre-filter, exact coverage, recent channels) is lib/explore.ts.
//
// score = fit(coverage, band)                       ∈ [0, 1]
//       + NOVELTY_WEIGHT · novelty(newCommonWords)  ∈ [0, 0.15]
//       + NARROW_WEIGHT  · sameChannelRecently       ∈ {0, 0.2}
//
// fit is 1 at the band center, 0.5 at the band edges, and falls to 0 at
// OUTSIDE_FALLOFF points outside the band — so coverage dominates ("closest to
// the band center first") and the two boosts act as tie-breakers worth about
// one coverage point each inside a 5-point band. Videos ≥ 98% covered never
// reach here (nothing to learn). Spec: docs/plans/2026-10-30-explore-spec.md.

export type CoverageBand = { lo: number; hi: number };

/** 90–95%: the comprehensible-input target (Durbahn et al. 2024; ~96% for Japanese). */
export const DEFAULT_BAND: CoverageBand = { lo: 90, hi: 95 };
export const BAND_PRESETS: readonly CoverageBand[] = [
  { lo: 85, hi: 90 },
  { lo: 90, hi: 95 },
  { lo: 95, hi: 98 },
];
/** Already this covered ⇒ excluded: comfortable reading, little to learn (Hu & Nation 2000). */
export const EXCLUDE_COVERED_AT = 98;
/** Lowest band floor accepted from the URL. */
export const BAND_MIN = 60;

/** Points outside the band at which fit reaches 0. */
export const OUTSIDE_FALLOFF = 10;
/** k: a video "brings novelty" with at least this many unknown common words. */
export const NOVELTY_MIN_WORDS = 3;
/** novelty saturates at this many unknown common words. */
export const NOVELTY_SATURATION = 12;
export const NOVELTY_WEIGHT = 0.15;
export const NARROW_WEIGHT = 0.2;

/** "90-95" → band; anything malformed or out of range → the default. */
export function parseBand(raw: string | null | undefined): CoverageBand {
  const m = typeof raw === "string" ? /^(\d{2})-(\d{2})$/.exec(raw.trim()) : null;
  if (!m) return DEFAULT_BAND;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (lo < BAND_MIN || hi > EXCLUDE_COVERED_AT || hi <= lo) return DEFAULT_BAND;
  return { lo, hi };
}

export const bandKey = (b: CoverageBand) => `${b.lo}-${b.hi}`;
export const bandCenter = (b: CoverageBand) => (b.lo + b.hi) / 2;

/** 1 at the center, 0.5 at the edges, 0 at OUTSIDE_FALLOFF points outside. */
export function bandFit(coverage: number, band: CoverageBand): number {
  const center = bandCenter(band);
  const half = Math.max(0.5, (band.hi - band.lo) / 2);
  const d = Math.abs(coverage - center);
  if (d <= half) return 1 - 0.5 * (d / half);
  return Math.max(0, 0.5 * (1 - (d - half) / OUTSIDE_FALLOFF));
}

/** 0 below k unknown common words, then linear up to 1 at NOVELTY_SATURATION. */
export function novelty(newCommonWords: number): number {
  if (newCommonWords < NOVELTY_MIN_WORDS) return 0;
  return Math.min(1, newCommonWords / NOVELTY_SATURATION);
}

export type RankInput = {
  videoId: string;
  /** Headline token-weighted coverage, 0–100. */
  coverage: number;
  /** Distinct unknown words in the top frequency ranks (NOVELTY_MAX_RANK). */
  newCommonWords: number;
  /** Narrow viewing: the title of a video of the same channel the user watched recently (else null). */
  narrowFrom: string | null;
};

export type ScoreParts = { fit: number; novelty: number; narrow: number; score: number };

export function exploreScore(c: RankInput, band: CoverageBand): ScoreParts {
  const fit = bandFit(c.coverage, band);
  const nov = novelty(c.newCommonWords);
  const narrow = c.narrowFrom ? 1 : 0;
  return { fit, novelty: nov, narrow, score: fit + NOVELTY_WEIGHT * nov + NARROW_WEIGHT * narrow };
}

/** Eligible for Explore at all: has a number, below the "already covered" cut. */
export const isEligible = (coverage: number | null | undefined): coverage is number =>
  typeof coverage === "number" && coverage < EXCLUDE_COVERED_AT;

/**
 * Rank: score desc, then closeness to the center, then id (stable). Inputs
 * that are not eligible are dropped.
 */
export function rankCandidates<T extends RankInput>(items: readonly T[], band: CoverageBand): (T & { parts: ScoreParts })[] {
  const center = bandCenter(band);
  return items
    .filter((c) => isEligible(c.coverage))
    .map((c) => ({ ...c, parts: exploreScore(c, band) }))
    .sort(
      (a, b) =>
        b.parts.score - a.parts.score ||
        Math.abs(a.coverage - center) - Math.abs(b.coverage - center) ||
        (a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0),
    );
}

/** The card's one-line explanation: "94% covered · 12 new common words · same channel as …". */
export function explainScore(c: RankInput): string {
  const parts = [`${Math.round(c.coverage)}% covered`];
  if (c.newCommonWords > 0) {
    parts.push(`${c.newCommonWords} new common word${c.newCommonWords === 1 ? "" : "s"}`);
  }
  if (c.narrowFrom) parts.push(`same channel as “${c.narrowFrom}”`);
  return parts.join(" · ");
}
