// Known-word model (T3.9): three confidence tiers per (user, word) and the
// token-weighted lexical coverage of a video built on them. Pure core (unit-
// tested) + the SQL form of the same tier rule for aggregates. Lives in
// @fuchine/db since T3.10 so the worker (daily calibration, Explore's coverage
// materialization) and the web app share one rule; apps/web/lib/known-words
// re-exports it. lib/word-status is the façade the player coloring reads;
// lib/study and lib/albums run the aggregates.
// Specs: docs/plans/2026-10-30-known-words-spec.md, …-explore-spec.md.

import { sql, type SQL } from "drizzle-orm";

export type WordTier = "unknown" | "likely" | "confirmed";
export const WORD_TIERS: readonly WordTier[] = ["unknown", "likely", "confirmed"];

/** saved_words.status — the user's manual override. */
export type ManualStatus = "known" | "learning" | "new" | null | undefined;

/** The user_word_stats signals the tiers read. Missing row ⇒ null. */
export type WordSignals = {
  views: number;
  clicks: number;
  reviewsOk: number;
  reviewsTotal?: number;
  /** Outcome of the most recent review (grade ≥ 3). null = unknown (legacy). */
  lastReviewOk?: boolean | null;
  lastClickedAt?: Date | null;
};

/** A left-joined user_word_stats row (all-null ⇒ no row) → signals. */
export function signalsFromRow(r: {
  views: number | null;
  clicks: number | null;
  reviewsOk: number | null;
  reviewsTotal: number | null;
  lastReviewOk: boolean | null;
  lastClickedAt: Date | null;
}): WordSignals | null {
  if (r.views === null) return null;
  return {
    views: r.views, clicks: r.clicks ?? 0, reviewsOk: r.reviewsOk ?? 0, reviewsTotal: r.reviewsTotal ?? 0,
    lastReviewOk: r.lastReviewOk, lastClickedAt: r.lastClickedAt,
  };
}

// ---- Thresholds (rationale in the spec; T3.10 calibrates them) ----

/** confirmed: at least this many correct reviews of a card containing the word… */
export const CONFIRMED_MIN_REVIEWS_OK = 1;
/**
 * likely: met in at least this many subtitle lines watched. Up from v1's 5:
 * the beacon counts a line as "seen" whether or not the learner attended to
 * it, and incidental-learning studies put meaningful form–meaning gains at
 * ~10+ encounters (Webb 2007; Peters & Webb 2018). Placeholder until the
 * calibration report (scripts/calibrate-known-words.ts) has real data.
 */
export const LIKELY_MIN_VIEWS = 10;
/** …and looked up at most once per this many sightings (clicks ≤ 10% of views). */
export const LIKELY_VIEWS_PER_CLICK = 10;
/** A popup lookup this recent demotes "likely" → "unknown" (one FSRS-ish second interval). */
export const LOOKUP_DECAY_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Weight of a "likely" token in the headline coverage: P(known | likely).
 * 0.7 is a deliberately conservative prior (the band shows the full 0–1
 * range); T3.10 replaces it with the calibrated rate from review_logs.
 */
export const LIKELY_WEIGHT = 0.7;

/** Below these, a coverage percentage is noise: one word moves it 2+ points. */
export const COVERAGE_MIN_TOKENS = 50;
export const COVERAGE_MIN_WORDS = 10;

/**
 * The two calibrated knobs (T3.10). The daily calibration job measures them
 * (./calibration) and stores them per instance — or per user with enough data
 * of their own; loadKnownWordParams resolves user → instance → these defaults.
 */
export type KnownWordParams = {
  likelyWeight: number;
  likelyMinViews: number;
  source: "default" | "instance" | "user";
};

export const DEFAULT_KNOWN_WORD_PARAMS: KnownWordParams = Object.freeze({
  likelyWeight: LIKELY_WEIGHT,
  likelyMinViews: LIKELY_MIN_VIEWS,
  source: "default",
}) as KnownWordParams;

/** Bounds a stored value must respect to be used (else the default applies). */
export const LIKELY_WEIGHT_RANGE = [0.3, 1] as const;
export const LIKELY_MIN_VIEWS_RANGE = [5, 30] as const;

/** Validate a stored calibration (jsonb) into params, or null when unusable. */
export function paramsFromStored(
  v: unknown,
  source: "instance" | "user",
): KnownWordParams | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { likelyWeight?: unknown; likelyMinViews?: unknown };
  const w = typeof o.likelyWeight === "number" && Number.isFinite(o.likelyWeight) ? o.likelyWeight : null;
  const n = typeof o.likelyMinViews === "number" && Number.isInteger(o.likelyMinViews) ? o.likelyMinViews : null;
  if (w === null || n === null) return null;
  if (w < LIKELY_WEIGHT_RANGE[0] || w > LIKELY_WEIGHT_RANGE[1]) return null;
  if (n < LIKELY_MIN_VIEWS_RANGE[0] || n > LIKELY_MIN_VIEWS_RANGE[1]) return null;
  return { likelyWeight: w, likelyMinViews: n, source };
}

/**
 * Has the most recent evidence from reviews confirmed the word? Legacy rows
 * (last outcome unknown) fall back to "at least as many OK as failed".
 */
function reviewConfirmed(s: WordSignals): boolean {
  if (s.reviewsOk < CONFIRMED_MIN_REVIEWS_OK) return false;
  if (s.lastReviewOk === true) return true;
  if (s.lastReviewOk === false) return false;
  return s.reviewsOk * 2 >= (s.reviewsTotal ?? s.reviewsOk);
}

function implicitLikely(s: WordSignals, now: Date, minViews: number): boolean {
  if (s.views < minViews) return false;
  if (s.clicks * LIKELY_VIEWS_PER_CLICK > s.views) return false;
  if (s.lastClickedAt && now.getTime() - s.lastClickedAt.getTime() < LOOKUP_DECAY_DAYS * DAY_MS) return false;
  return true;
}

/**
 * The tier rule, in order:
 *  1. manual "known" ⇒ confirmed; manual "new" ⇒ unknown.
 *  2. confirmed ⇔ reviewsOk ≥ 1 and the most recent review was OK. A failed
 *     last review removes the confirmation but does not force "unknown": a
 *     sentence card fails for one word, not all of them (は would drop out of
 *     every card the user ever missed).
 *  3. likely ⇔ views ≥ 10 (calibrated: `minViews`), clicks ≤ 10% of views,
 *     no lookup in 14 days.
 *  4. manual "learning" caps the result at likely.
 *  5. otherwise unknown. A recent lookup only demotes likely — a confirmed
 *     word looked up again (checking a nuance) stays confirmed.
 */
export function wordTier(
  stats: WordSignals | null | undefined,
  manual?: ManualStatus,
  now: Date = new Date(),
  minViews: number = LIKELY_MIN_VIEWS,
): WordTier {
  if (manual === "known") return "confirmed";
  if (manual === "new") return "unknown";
  let tier: WordTier = "unknown";
  if (stats) {
    if (reviewConfirmed(stats)) tier = "confirmed";
    else if (implicitLikely(stats, now, minViews)) tier = "likely";
  }
  if (manual === "learning" && tier === "confirmed") return "likely";
  return tier;
}

/**
 * The same rule in SQL, over a row left-joined from "user_word_stats" and
 * "saved_words" (aliases fixed: the tables' own names). NULL rows ⇒ unknown.
 * Columns are hand-qualified (drizzle renders bare refs unqualified inside a
 * select projection). Keep in lockstep with wordTier — the E2E checks both
 * agree on the same fixture. `minViews` is the calibrated likely threshold
 * (an integer, inlined as a literal — the same SQL object must be reused in
 * SELECT and GROUP BY).
 */
export function wordTierSqlFor(minViews: number = LIKELY_MIN_VIEWS): SQL<WordTier> {
  const n = Number.isInteger(minViews) && minViews > 0 ? minViews : LIKELY_MIN_VIEWS;
  return sql<WordTier>`(case
  when "saved_words"."status" = 'known' then 'confirmed'
  when "saved_words"."status" = 'new' then 'unknown'
  when "user_word_stats"."reviews_ok" >= ${sql.raw(String(CONFIRMED_MIN_REVIEWS_OK))}
    and coalesce("user_word_stats"."last_review_ok", "user_word_stats"."reviews_ok" * 2 >= "user_word_stats"."reviews_total")
    then (case when "saved_words"."status" = 'learning' then 'likely' else 'confirmed' end)
  when "user_word_stats"."views" >= ${sql.raw(String(n))}
    and "user_word_stats"."clicks" * ${sql.raw(String(LIKELY_VIEWS_PER_CLICK))} <= "user_word_stats"."views"
    and ("user_word_stats"."last_clicked_at" is null
      or "user_word_stats"."last_clicked_at" < now() - interval '${sql.raw(String(LOOKUP_DECAY_DAYS))} days')
    then 'likely'
  else 'unknown'
end)`;
}

/** The tier rule in SQL with the default (uncalibrated) threshold. */
export const wordTierSql: SQL<WordTier> = wordTierSqlFor(LIKELY_MIN_VIEWS);

// ---- Coverage ----

export type TierCounts = Record<WordTier, { tokens: number; words: number }>;

export const emptyTierCounts = (): TierCounts => ({
  unknown: { tokens: 0, words: 0 },
  likely: { tokens: 0, words: 0 },
  confirmed: { tokens: 0, words: 0 },
});

/**
 * Coverage of one video for one user. Percentages 0–100, rounded.
 *  - headline: token-weighted (running words), confirmed + LIKELY_WEIGHT·likely
 *  - low / high: the confidence band — confirmed only / confirmed + likely
 *  - unique (+ uniqueLow/uniqueHigh): the same over distinct words (secondary)
 *  - tokens / words: countable running tokens / distinct words
 */
export type Coverage = {
  headline: number;
  low: number;
  high: number;
  unique: number;
  uniqueLow: number;
  uniqueHigh: number;
  tokens: number;
  words: number;
};

const pct = (n: number, d: number) => Math.round((100 * n) / d);

/** Coverage from per-tier counts; null when too few countable tokens/words. */
export function coverageFromTierCounts(c: TierCounts, likelyWeight = LIKELY_WEIGHT): Coverage | null {
  const tokens = c.unknown.tokens + c.likely.tokens + c.confirmed.tokens;
  const words = c.unknown.words + c.likely.words + c.confirmed.words;
  if (tokens < COVERAGE_MIN_TOKENS || words < COVERAGE_MIN_WORDS) return null;
  return {
    headline: pct(c.confirmed.tokens + likelyWeight * c.likely.tokens, tokens),
    low: pct(c.confirmed.tokens, tokens),
    high: pct(c.confirmed.tokens + c.likely.tokens, tokens),
    unique: pct(c.confirmed.words + likelyWeight * c.likely.words, words),
    uniqueLow: pct(c.confirmed.words, words),
    uniqueHigh: pct(c.confirmed.words + c.likely.words, words),
    tokens,
    words,
  };
}

/** Tier counts straight from (occurrences, tier) rows — the pure twin of the SQL aggregate. */
export function tierCountsFromWords(rows: Iterable<{ occurrences: number; tier: WordTier }>): TierCounts {
  const c = emptyTierCounts();
  for (const r of rows) {
    if (r.occurrences <= 0) continue;
    c[r.tier].tokens += r.occurrences;
    c[r.tier].words += 1;
  }
  return c;
}

/**
 * Apply a user's token corrections to a video's shared tier counts: `deltas`
 * is (corrected − original) occurrences per word over the corrected lines,
 * `base` the word's shared occurrences in the video, `tiers` its tier. A word
 * whose count crosses 0 enters/leaves the distinct-word count. Mutates `c`.
 */
export function applyCountDeltas(
  c: TierCounts,
  deltas: ReadonlyMap<string, number>,
  base: ReadonlyMap<string, number>,
  tiers: ReadonlyMap<string, WordTier>,
): TierCounts {
  for (const [word, d] of deltas) {
    if (d === 0) continue;
    const tier = tiers.get(word) ?? "unknown";
    const before = Math.max(0, base.get(word) ?? 0);
    const after = Math.max(0, before + d);
    c[tier].tokens += after - before;
    if (before === 0 && after > 0) c[tier].words += 1;
    if (before > 0 && after === 0) c[tier].words -= 1;
  }
  return c;
}

/** Per-word (corrected − original) coverage occurrences, from two occurrence maps. */
export function diffCounts(
  original: ReadonlyMap<string, number>,
  corrected: ReadonlyMap<string, number>,
  into: Map<string, number> = new Map(),
): Map<string, number> {
  for (const [w, n] of corrected) into.set(w, (into.get(w) ?? 0) + n);
  for (const [w, n] of original) into.set(w, (into.get(w) ?? 0) - n);
  return into;
}
