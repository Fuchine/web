// Frequency tier (0–5) for UI dots. Shared between the dictionary screen and
// the player popup so the same word shows the same number of dots everywhere.
// Cuts: 1500/5000/15000/30000 (based on JMdict frequency rank distribution).

export function freqTier(rank: number | null): number {
  if (rank == null) return 0;
  if (rank <= 1500) return 5;
  if (rank <= 5000) return 4;
  if (rank <= 15000) return 3;
  if (rank <= 30000) return 2;
  return 1;
}