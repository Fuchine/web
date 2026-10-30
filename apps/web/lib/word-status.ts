import { sql } from "drizzle-orm";
import { userWordStats } from "@fuchine/db";

// Per-word knowledge status (T3.8). The single place the "known" rule lives:
// the player's coloring (getWordStatuses) and the comprehension % of the
// library and albums (in SQL, via knownWordSql) both read it from here. T3.9
// swaps this heuristic for the three-tier confidence model.

/** Matches WordStatus in @fuchine/ui (the player renders it). */
export type WordStatus = "unknown" | "seen" | "known";

// "Known" heuristic v1: the user answered a review containing the word
// correctly at least once, or has seen it in this many subtitle lines.
export const KNOWN_MIN_VIEWS = 5;
export const KNOWN_MIN_REVIEWS_OK = 1;

export type WordStatsSignal = { views: number; clicks: number; reviewsOk: number };

export function wordStatusFromStats(stats: WordStatsSignal | null | undefined): WordStatus {
  if (!stats) return "unknown";
  if (stats.reviewsOk >= KNOWN_MIN_REVIEWS_OK || stats.views >= KNOWN_MIN_VIEWS) return "known";
  if (stats.views > 0 || stats.clicks > 0) return "seen";
  return "unknown";
}

/**
 * The "known" half of wordStatusFromStats as a SQL predicate over a
 * user_word_stats row (left-joined: NULL stats ⇒ not known), for aggregates.
 */
export const knownWordSql = sql`(${userWordStats.reviewsOk} >= ${sql.raw(String(KNOWN_MIN_REVIEWS_OK))} or ${userWordStats.views} >= ${sql.raw(String(KNOWN_MIN_VIEWS))})`;
