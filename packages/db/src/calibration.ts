// Known-word calibration (T3.9 report → T3.10 loop). Is the "likely" tier too
// optimistic? A word's tier just before its FIRST review is compared with that
// review's outcome:
//  - exact: the snapshot the review writer records since 0021
//    (user_word_stats.first_review_tier / first_review_ok);
//  - reconstructed (report only): older words, tier from today's views/clicks
//    with reviews ignored — optimistic, since views kept growing.
//
// Two entry points share the math:
//  - collectCalibrationSamples + summarizeCalibration: the detailed report of
//    apps/web/scripts/calibrate-known-words.ts (replays review_logs, with the
//    user's token corrections);
//  - runKnownWordCalibration: the daily worker job. It reads only the exact
//    snapshots (one aggregate over user_word_stats — no review_logs replay)
//    and writes the measured LIKELY_WEIGHT and a suggested LIKELY_MIN_VIEWS:
//    per user when the user alone has ≥ CALIBRATION_MIN_SAMPLE exact "likely"
//    first reviews (user_settings.known_word_params), per instance otherwise
//    (instance_settings["known_words"]). Below the minimum nothing is written
//    and loadKnownWordParams falls back to the constants.
// Spec: docs/plans/2026-10-30-explore-spec.md (§ Calibration loop).

import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "./client";
import {
  instanceSettings,
  reviewLogs,
  savedWords,
  sentenceCards,
  subtitleLines,
  tokenOverrides,
  userSettings,
  userWordStats,
} from "./schema";
import type { KnownWordCalibration, Token } from "./types";
import {
  DEFAULT_KNOWN_WORD_PARAMS,
  LIKELY_MIN_VIEWS,
  LIKELY_MIN_VIEWS_RANGE,
  LIKELY_WEIGHT,
  LIKELY_WEIGHT_RANGE,
  WORD_TIERS,
  paramsFromStored,
  wordTier,
  type KnownWordParams,
  type WordTier,
} from "./known-words";
import { applyTokenOverridesDetailed, type TokenOverride } from "./token-overrides";

export type CalibrationSample = {
  tier: WordTier;
  source: "exact" | "reconstructed";
  grade: number; // 1 Again 2 Hard 3 Good 4 Easy
};

export type CalibrationRow = {
  tier: WordTier;
  source: "exact" | "reconstructed";
  words: number;
  /** Share whose first review was OK by the model's rule (grade ≥ 3). */
  okRate: number | null;
  /** Share recalled at all (grade ≥ 2, FSRS "pass"). */
  passRate: number | null;
};

/** Below this many exact "likely" first reviews a rate is not used. */
export const CALIBRATION_MIN_SAMPLE = 30;
/**
 * The LIKELY_MIN_VIEWS controller's hysteresis band on P(OK | likely): below
 * the low mark "likely" is too optimistic → raise the threshold; above the
 * high mark it is conservative → lower it; in between keep it. One step per
 * run (daily), so the threshold drifts instead of jumping on one noisy day.
 */
export const LIKELY_OK_LOW = 0.7;
export const LIKELY_OK_HIGH = 0.9;
export const MIN_VIEWS_STEP_UP = 2;
export const MIN_VIEWS_STEP_DOWN = 1;

export const INSTANCE_KNOWN_WORDS_KEY = "known_words";

/** Pure: per tier × source, the first-review outcome rates. */
export function summarizeCalibration(samples: readonly CalibrationSample[]): CalibrationRow[] {
  const rows: CalibrationRow[] = [];
  for (const source of ["exact", "reconstructed"] as const) {
    for (const tier of WORD_TIERS) {
      const s = samples.filter((x) => x.source === source && x.tier === tier);
      rows.push({
        tier,
        source,
        words: s.length,
        okRate: s.length ? s.filter((x) => x.grade >= 3).length / s.length : null,
        passRate: s.length ? s.filter((x) => x.grade >= 2).length / s.length : null,
      });
    }
  }
  return rows;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Headline weight from a measured P(OK | likely): rounded to 0.01, clamped to the usable range. */
export function measuredLikelyWeight(okRate: number): number {
  return clamp(Math.round(okRate * 100) / 100, LIKELY_WEIGHT_RANGE[0], LIKELY_WEIGHT_RANGE[1]);
}

/**
 * Suggested LIKELY_MIN_VIEWS from the measured P(OK | likely) and the
 * threshold in force when those samples were taken (hysteresis controller).
 */
export function suggestLikelyMinViews(okRate: number, current: number = LIKELY_MIN_VIEWS): number {
  const [lo, hi] = LIKELY_MIN_VIEWS_RANGE;
  if (okRate < LIKELY_OK_LOW) return clamp(current + MIN_VIEWS_STEP_UP, lo, hi);
  if (okRate > LIKELY_OK_HIGH) return clamp(current - MIN_VIEWS_STEP_DOWN, lo, hi);
  return clamp(current, lo, hi);
}

/**
 * Suggested headline weight for "likely" tokens = P(first review OK | likely),
 * from exact snapshots only; the default below the minimum sample.
 */
export function suggestLikelyWeight(rows: readonly CalibrationRow[]): { weight: number; basis: "measured" | "default"; n: number } {
  const likely = rows.find((r) => r.source === "exact" && r.tier === "likely");
  if (!likely || likely.words < CALIBRATION_MIN_SAMPLE || likely.okRate == null) {
    return { weight: LIKELY_WEIGHT, basis: "default", n: likely?.words ?? 0 };
  }
  return { weight: measuredLikelyWeight(likely.okRate), basis: "measured", n: likely.words };
}

/**
 * Pure: the calibration a set of exact "likely" first reviews supports, or
 * null below the minimum sample. `current` = the min-views threshold in force;
 * `previousSamples` = the sample size of the stored calibration it came from.
 * The threshold only steps when there are NEW samples — re-running the job on
 * unchanged data must not keep ratcheting it.
 */
export function calibrateFromCounts(
  likely: { n: number; ok: number },
  current: number,
  scope: "instance" | "user",
  now: Date = new Date(),
  minSample: number = CALIBRATION_MIN_SAMPLE,
  previousSamples: number | null = null,
): KnownWordCalibration | null {
  if (likely.n < minSample || likely.n <= 0) return null;
  const okRate = likely.ok / likely.n;
  const fresh = previousSamples === null || likely.n !== previousSamples;
  return {
    likelyWeight: measuredLikelyWeight(okRate),
    likelyMinViews: fresh
      ? suggestLikelyMinViews(okRate, current)
      : clamp(current, LIKELY_MIN_VIEWS_RANGE[0], LIKELY_MIN_VIEWS_RANGE[1]),
    samples: likely.n,
    okRate,
    scope,
    computedAt: now.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Reading the calibrated parameters                                    */
/* ------------------------------------------------------------------ */

/**
 * The known-word parameters in force for a user: their own calibration, else
 * the instance's, else the constants. One query (two PK lookups).
 */
export async function loadKnownWordParams(db: DbOrTx, userId?: string | null): Promise<KnownWordParams> {
  const rows = await db.execute<{ user_params: unknown; instance_params: unknown }>(sql`
    select
      ${userId ? sql`(select ${userSettings.knownWordParams} from ${userSettings} where ${userSettings.userId} = ${userId})` : sql`null::jsonb`} as user_params,
      (select ${instanceSettings.value} from ${instanceSettings} where ${instanceSettings.key} = ${INSTANCE_KNOWN_WORDS_KEY}) as instance_params
  `);
  const r = (rows as unknown as { user_params: unknown; instance_params: unknown }[])[0];
  return (
    paramsFromStored(r?.user_params, "user") ??
    paramsFromStored(r?.instance_params, "instance") ??
    { ...DEFAULT_KNOWN_WORD_PARAMS }
  );
}

/* ------------------------------------------------------------------ */
/* The daily job                                                        */
/* ------------------------------------------------------------------ */

export type CalibrationRunReport = {
  instance: KnownWordCalibration | null;
  /** Exact "likely" first reviews across the instance. */
  instanceSamples: number;
  usersCalibrated: number;
  usersCleared: number;
};

/**
 * Measure and store the calibration (the daily worker job; also callable from
 * a script or the E2E). Idempotent: re-running on the same data rewrites the
 * same weight; the min-views step is relative to the threshold in force, so
 * it moves one step per run until the rate is inside the hysteresis band.
 */
export async function runKnownWordCalibration(
  db: Database,
  opts: { now?: Date; minSample?: number } = {},
): Promise<CalibrationRunReport> {
  const now = opts.now ?? new Date();
  const minSample = opts.minSample ?? CALIBRATION_MIN_SAMPLE;

  // Exact snapshots of "likely" words, per user (first_review_tier is written
  // once, on the word's first review).
  const perUser = await db
    .select({
      userId: userWordStats.userId,
      n: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${userWordStats.firstReviewOk})::int`,
    })
    .from(userWordStats)
    .where(eq(userWordStats.firstReviewTier, "likely"))
    .groupBy(userWordStats.userId);

  const totalN = perUser.reduce((a, r) => a + Number(r.n), 0);
  const totalOk = perUser.reduce((a, r) => a + Number(r.ok), 0);

  const [prevRow] = await db
    .select({ value: instanceSettings.value })
    .from(instanceSettings)
    .where(eq(instanceSettings.key, INSTANCE_KNOWN_WORDS_KEY));
  const prev = prevRow?.value as Partial<KnownWordCalibration> | undefined;
  const current = await loadKnownWordParams(db, null);
  const instance = calibrateFromCounts(
    { n: totalN, ok: totalOk }, current.likelyMinViews, "instance", now, minSample,
    current.source === "instance" && typeof prev?.samples === "number" ? prev.samples : null,
  );
  if (instance) {
    await db
      .insert(instanceSettings)
      .values({ key: INSTANCE_KNOWN_WORDS_KEY, value: instance, updatedAt: now })
      .onConflictDoUpdate({ target: instanceSettings.key, set: { value: instance, updatedAt: now } });
  } else {
    await db.delete(instanceSettings).where(eq(instanceSettings.key, INSTANCE_KNOWN_WORDS_KEY));
  }

  // Per user: only with enough data of their own; everyone else inherits the
  // instance numbers (their stored params, if any, are cleared).
  let usersCalibrated = 0;
  const eligible = new Set<string>();
  for (const r of perUser) {
    if (Number(r.n) < minSample) continue;
    const [ownRow] = await db
      .select({ v: userSettings.knownWordParams })
      .from(userSettings)
      .where(eq(userSettings.userId, r.userId));
    const own = paramsFromStored(ownRow?.v, "user");
    const cal = calibrateFromCounts(
      { n: Number(r.n), ok: Number(r.ok) },
      own ? own.likelyMinViews : (instance?.likelyMinViews ?? current.likelyMinViews),
      "user",
      now,
      minSample,
      own && typeof ownRow?.v?.samples === "number" ? ownRow.v.samples : null,
    );
    if (!cal) continue;
    eligible.add(r.userId);
    await db.update(userSettings).set({ knownWordParams: cal }).where(eq(userSettings.userId, r.userId));
    usersCalibrated++;
  }
  const stale = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(isNotNull(userSettings.knownWordParams));
  const toClear = stale.map((s) => s.userId).filter((id) => !eligible.has(id));
  if (toClear.length > 0) {
    await db.update(userSettings).set({ knownWordParams: null }).where(inArray(userSettings.userId, toClear));
  }

  return { instance, instanceSamples: totalN, usersCalibrated, usersCleared: toClear.length };
}

/* ------------------------------------------------------------------ */
/* The detailed report (script)                                         */
/* ------------------------------------------------------------------ */

async function loadOverrides(db: DbOrTx, userId: string, lineIds: readonly string[]) {
  const out = new Map<string, TokenOverride[]>();
  const unique = [...new Set(lineIds)];
  for (let i = 0; i < unique.length; i += 5000) {
    const rows = await db
      .select({
        lineId: tokenOverrides.subtitleLineId,
        startIdx: tokenOverrides.startIdx,
        endIdx: tokenOverrides.endIdx,
        tokens: tokenOverrides.tokens,
      })
      .from(tokenOverrides)
      .where(and(eq(tokenOverrides.userId, userId), inArray(tokenOverrides.subtitleLineId, unique.slice(i, i + 5000))));
    for (const r of rows) out.set(r.lineId, [...(out.get(r.lineId) ?? []), r]);
  }
  return out;
}

/** Collect one sample per (user, word) from review_logs. `userId` narrows to one user. */
export async function collectCalibrationSamples(
  db: Database,
  opts: { userId?: string } = {},
): Promise<CalibrationSample[]> {
  const logs = await db
    .select({
      userId: reviewLogs.userId,
      lineId: sentenceCards.subtitleLineId,
      tokens: subtitleLines.tokens,
      grade: reviewLogs.grade,
    })
    .from(reviewLogs)
    .innerJoin(sentenceCards, eq(sentenceCards.id, reviewLogs.cardId))
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .where(opts.userId ? eq(reviewLogs.userId, opts.userId) : undefined)
    .orderBy(asc(reviewLogs.reviewedAt), asc(reviewLogs.id));

  // Earliest review per (user, word), words as the user saw them (T3.7).
  const byUser = new Map<string, typeof logs>();
  for (const l of logs) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);

  const samples: CalibrationSample[] = [];
  for (const [userId, userLogs] of byUser) {
    const overrides = await loadOverrides(db, userId, userLogs.map((l) => l.lineId));
    const first = new Map<string, number>(); // word → grade of its first review
    for (const l of userLogs) {
      const original = (l.tokens as Token[] | null) ?? [];
      const o = overrides.get(l.lineId);
      const tokens = o && o.length > 0 ? applyTokenOverridesDetailed(original, o).tokens : original;
      for (const t of tokens) {
        if (t.wordEntryId && !first.has(t.wordEntryId)) first.set(t.wordEntryId, l.grade);
      }
    }
    const ids = [...first.keys()];
    for (let i = 0; i < ids.length; i += 5000) {
      const chunk = ids.slice(i, i + 5000);
      const stats = await db
        .select({
          wordEntryId: userWordStats.wordEntryId,
          firstReviewTier: userWordStats.firstReviewTier,
          views: userWordStats.views,
          clicks: userWordStats.clicks,
          lastClickedAt: userWordStats.lastClickedAt,
          manual: savedWords.status,
        })
        .from(userWordStats)
        .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, userWordStats.wordEntryId)))
        .where(and(eq(userWordStats.userId, userId), inArray(userWordStats.wordEntryId, chunk)));
      for (const s of stats) {
        const grade = first.get(s.wordEntryId)!;
        const snap = s.firstReviewTier as WordTier | null;
        if (snap && (WORD_TIERS as readonly string[]).includes(snap)) {
          samples.push({ tier: snap, source: "exact", grade });
        } else {
          // Reviews ignored: what the implicit signals say (today's counts).
          const tier = wordTier({ views: s.views, clicks: s.clicks, reviewsOk: 0, lastClickedAt: s.lastClickedAt }, s.manual);
          samples.push({ tier, source: "reconstructed", grade });
        }
      }
    }
  }
  return samples;
}

/** Plain-text table for the script. */
export function formatCalibration(rows: readonly CalibrationRow[]): string {
  const pctOf = (x: number | null) => (x == null ? "    –" : `${(100 * x).toFixed(1).padStart(5)}%`);
  const out = [
    "tier       source         words   first review OK (≥Good)   recalled (≥Hard)",
    "---------  -------------  ------  ------------------------  ----------------",
  ];
  for (const r of rows) {
    out.push(
      `${r.tier.padEnd(9)}  ${r.source.padEnd(13)}  ${String(r.words).padStart(6)}  ${pctOf(r.okRate).padStart(24)}  ${pctOf(r.passRate).padStart(16)}`,
    );
  }
  return out.join("\n");
}
