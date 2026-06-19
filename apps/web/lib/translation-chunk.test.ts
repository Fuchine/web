import { describe, it, expect } from "vitest";
import {
  TRANSLATION_CHUNK_SIZE,
  chunkIndexForLine,
  lineRangeForChunk,
} from "@fuchine/core";

describe("chunk math", () => {
  it("chunk size is 30", () => {
    expect(TRANSLATION_CHUNK_SIZE).toBe(30);
  });
  it("maps line idx to chunk idx", () => {
    expect(chunkIndexForLine(0)).toBe(0);
    expect(chunkIndexForLine(29)).toBe(0);
    expect(chunkIndexForLine(30)).toBe(1);
    expect(chunkIndexForLine(61)).toBe(2);
  });
  it("maps chunk idx to inclusive line range", () => {
    expect(lineRangeForChunk(0)).toEqual({ startIdx: 0, endIdx: 29 });
    expect(lineRangeForChunk(2)).toEqual({ startIdx: 60, endIdx: 89 });
  });
});
