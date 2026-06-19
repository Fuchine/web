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
