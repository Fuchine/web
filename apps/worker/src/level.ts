// Content-level estimation (videos.level_estimate). Heuristic v1: the median
// JMdict frequency rank of the video's distinct dictionary words. Median (not
// mean) so a long tail of rare proper nouns can't drag an easy vlog to
// "advanced". Unranked words carry no signal and are ignored.

export type ContentLevel = "beginner" | "intermediate" | "advanced";

/** Below this many ranked words the estimate is noise — leave the level null. */
export const MIN_RANKED_WORDS = 20;

const BEGINNER_MAX_MEDIAN_RANK = 5_000;
const INTERMEDIATE_MAX_MEDIAN_RANK = 15_000;

export function estimateLevel(frequencyRanks: (number | null)[]): ContentLevel | null {
  const ranked = frequencyRanks.filter((r): r is number => r != null).sort((a, b) => a - b);
  if (ranked.length < MIN_RANKED_WORDS) return null;

  const mid = Math.floor(ranked.length / 2);
  const median = ranked.length % 2 === 1 ? ranked[mid]! : (ranked[mid - 1]! + ranked[mid]!) / 2;

  if (median <= BEGINNER_MAX_MEDIAN_RANK) return "beginner";
  if (median <= INTERMEDIATE_MAX_MEDIAN_RANK) return "intermediate";
  return "advanced";
}
