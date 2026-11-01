// Lexical coverage display (T3.9): the headline + confidence band computed
// server-side (apps/web/lib/known-words.ts), the research thresholds, and the
// tooltip text. Pure — unit-tested.

/** One video's coverage for the viewer, all 0–100. */
export type CoverageInfo = {
  /** Token-weighted headline (running words). */
  headline: number;
  /** Lower bound: words confirmed by a correct review (or marked known). */
  low: number;
  /** Upper bound: confirmed + likely (seen often without lookup). */
  high: number;
  /** Unique-word coverage (secondary). */
  unique?: number;
};

/**
 * Research thresholds for viewing: 80% minimum, most learners not adequate at
 * 90%, ~95% adequate (Durbahn et al., SSLA 2024; ~96% for Japanese, Komori et
 * al. 2004), 98% comfortable (Hu & Nation 2000, reading).
 */
export const COVERAGE_ZONES = [
  { min: 98, label: "Comfortable" },
  { min: 95, label: "Adequate" },
  { min: 90, label: "Challenging" },
  { min: 80, label: "Hard" },
  { min: 0, label: "Too hard for now" },
] as const;

export function coverageZone(pct: number): string {
  return COVERAGE_ZONES.find((z) => pct >= z.min)!.label;
}

/** "89–95", or "" when the band collapses to the headline (nothing likely). */
export function formatCoverageBand(c: Pick<CoverageInfo, "headline" | "low" | "high">): string {
  if (c.low === c.high && c.low === c.headline) return "";
  return `${c.low}–${c.high}`;
}

/** "93% (89–95)" — the compact form for cards and the player. */
export function formatCoverage(c: CoverageInfo): string {
  const band = formatCoverageBand(c);
  return band ? `${c.headline}% (${band})` : `${c.headline}%`;
}

/** Multi-line tooltip: what the number means, the tiers, the thresholds. */
export function coverageTooltip(c: CoverageInfo): string {
  const lines = [
    `You know about ${c.headline}% of the running words (${coverageZone(c.headline)}).`,
    `Range ${c.low}–${c.high}%: ${c.low}% are confirmed (reviewed correctly or marked known); ` +
      `${c.high}% adds words you've seen often without looking up.`,
  ];
  if (c.unique != null) lines.push(`Unique words: ${c.unique}%.`);
  lines.push(
    "Guide: 80% is the minimum to follow, 90% is still hard for most learners, 95% is adequate, 98% is comfortable.",
    "Names, interjections, numbers and symbols are not counted.",
  );
  return lines.join("\n");
}
