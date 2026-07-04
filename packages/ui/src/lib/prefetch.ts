// Target picking for the explain prefetch pump: the first line within the
// look-ahead window that is neither cached, in flight, nor failed. Pure so
// the pump's decision logic is testable outside React.

export type PrefetchState = {
  has: (lineId: string) => boolean;
  pending: (lineId: string) => boolean;
  failed: (lineId: string) => boolean;
};

export function pickPrefetchTarget<L extends { id: string }>(
  lines: readonly L[],
  baseIdx: number,
  ahead: number,
  state: PrefetchState,
): L | null {
  if (baseIdx < 0) return null;
  for (let d = 1; d <= ahead; d++) {
    const line = lines[baseIdx + d];
    if (!line) break;
    if (state.has(line.id) || state.pending(line.id) || state.failed(line.id)) continue;
    return line;
  }
  return null;
}
