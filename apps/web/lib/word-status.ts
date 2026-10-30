// Per-word knowledge status: the façade every read side goes through. Since
// T3.9 it is a thin mapping over the three-tier model in ./known-words — the
// player's coloring (getWordStatuses) reads wordStatusFromStats, the coverage
// of the library and albums reads wordTierSql — so changing the rule there
// switches both.

import { wordTier, type ManualStatus, type WordSignals, type WordTier } from "./known-words";

export { wordTierSql } from "./known-words";
export type { WordSignals as WordStatsSignal, WordTier, ManualStatus };

/** Matches WordStatus in @fuchine/ui (the player renders it). */
export type WordStatus = "unknown" | "seen" | "known";

/**
 * Tier → player color. unknown → "unknown"; likely → "seen" (furigana stays
 * on); confirmed → "known" (furigana hidden in "unknown words only" mode).
 */
export const TIER_TO_STATUS: Record<WordTier, WordStatus> = {
  unknown: "unknown",
  likely: "seen",
  confirmed: "known",
};

export function wordStatusFromStats(
  stats: WordSignals | null | undefined,
  manual?: ManualStatus,
  now: Date = new Date(),
): WordStatus {
  return TIER_TO_STATUS[wordTier(stats, manual, now)];
}
