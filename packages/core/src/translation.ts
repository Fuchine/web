// Progressive translation chunking. A chunk is a fixed window of subtitle
// lines, keyed by line idx. Shared by the translate endpoint (server) and the
// player (client) so both agree on chunk boundaries.

export const TRANSLATION_CHUNK_SIZE = 30;

/** The chunk a given 0-based line idx belongs to. */
export function chunkIndexForLine(idx: number): number {
  return Math.floor(idx / TRANSLATION_CHUNK_SIZE);
}

/** Inclusive [startIdx, endIdx] line range covered by a chunk. */
export function lineRangeForChunk(chunkIdx: number): {
  startIdx: number;
  endIdx: number;
} {
  const startIdx = chunkIdx * TRANSLATION_CHUNK_SIZE;
  return { startIdx, endIdx: startIdx + TRANSLATION_CHUNK_SIZE - 1 };
}

/**
 * Background-pump visiting order: the current chunk to the end, then wrap to
 * the start. The viewer benefits first; the whole video still gets covered.
 * startChunk is clamped into [0, maxChunk]; a negative maxChunk yields [].
 */
export function chunkPumpOrder(startChunk: number, maxChunk: number): number[] {
  if (maxChunk < 0) return [];
  const start = Math.min(Math.max(startChunk, 0), maxChunk);
  const order: number[] = [];
  for (let c = start; c <= maxChunk; c++) order.push(c);
  for (let c = 0; c < start; c++) order.push(c);
  return order;
}
