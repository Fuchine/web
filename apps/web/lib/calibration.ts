// Known-word calibration (T3.9 → basis for T3.10): is the "likely" tier too
// optimistic? For every (user, word), find the word's FIRST review in
// review_logs (the earliest review of any card whose line contains it — that
// is always some card's first review) and compare its outcome with the word's
// tier just before it:
//  - exact: the snapshot bumpWordReviews writes since 0021
//    (user_word_stats.first_review_tier);
//  - reconstructed: for older words, the tier from today's views/clicks with
//    reviews ignored — optimistic, since views kept growing after the review.
// If "likely" words fail their first review often, LIKELY_MIN_VIEWS (or the
// headline's LIKELY_WEIGHT) is too generous. Read by
// scripts/calibrate-known-words.ts and the E2E.

import { and, asc, eq, inArray } from "drizzle-orm";
import {
  type Database,
  reviewLogs,
  savedWords,
  sentenceCards,
  subtitleLines,
  userWordStats,
  type Token,
} from "@fuchine/db";
import { LIKELY_WEIGHT, WORD_TIERS, wordTier, type WordTier } from "./known-words";
import { correctLine, loadTokenOverrides } from "./token-overrides";

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

/** Below this many words a rate is not reported as a recommendation. */
export const CALIBRATION_MIN_SAMPLE = 30;

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

/**
 * Suggested headline weight for "likely" tokens = P(first review OK | likely),
 * from exact snapshots only; null (keep LIKELY_WEIGHT) below the minimum sample.
 */
export function suggestLikelyWeight(rows: readonly CalibrationRow[]): { weight: number; basis: "measured" | "default"; n: number } {
  const likely = rows.find((r) => r.source === "exact" && r.tier === "likely");
  if (!likely || likely.words < CALIBRATION_MIN_SAMPLE || likely.okRate == null) {
    return { weight: LIKELY_WEIGHT, basis: "default", n: likely?.words ?? 0 };
  }
  return { weight: Math.round(likely.okRate * 100) / 100, basis: "measured", n: likely.words };
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
    const overrides = await loadTokenOverrides(db, userId, userLogs.map((l) => l.lineId));
    const first = new Map<string, number>(); // word → grade of its first review
    for (const l of userLogs) {
      const tokens = correctLine(l.tokens as Token[] | null, overrides.get(l.lineId)).tokens;
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
