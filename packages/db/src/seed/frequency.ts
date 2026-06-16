// Load a frequency list into a term -> rank map (lower rank = more frequent).
//
// Format: plain TSV, one entry per line, either:
//   term<TAB>rank
//   term<TAB>reading<TAB>rank
// Lines starting with "#" and blank lines are ignored. The smallest rank wins
// if a term appears more than once.

import { readFileSync } from "node:fs";

export type FrequencyMap = Map<string, number>;

export function loadFrequency(path: string): FrequencyMap {
  const map: FrequencyMap = new Map();
  const text = readFileSync(path, "utf8");

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const cols = trimmed.split("\t");
    const term = cols[0]?.trim();
    const rankStr = cols[cols.length - 1]?.trim();
    if (!term || !rankStr) continue;

    const rank = Number.parseInt(rankStr, 10);
    if (!Number.isFinite(rank)) continue;

    const current = map.get(term);
    if (current === undefined || rank < current) map.set(term, rank);
  }

  return map;
}

/** Resolve a row's rank: prefer the lemma, fall back to the reading. */
export function rankFor(
  freq: FrequencyMap,
  lemma: string,
  reading: string,
): number | null {
  return freq.get(lemma) ?? freq.get(reading) ?? null;
}
