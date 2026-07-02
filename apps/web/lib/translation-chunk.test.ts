import { describe, it, expect } from "vitest";
import {
  TRANSLATION_CHUNK_SIZE,
  chunkIndexForLine,
  lineRangeForChunk,
  chunkPumpOrder,
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

describe("chunkPumpOrder", () => {
  it("walks from the current chunk to the end, then wraps to the start", () => {
    expect(chunkPumpOrder(2, 4)).toEqual([2, 3, 4, 0, 1]);
  });
  it("start at 0 is a plain forward walk", () => {
    expect(chunkPumpOrder(0, 3)).toEqual([0, 1, 2, 3]);
  });
  it("start at the last chunk covers the tail then the rest", () => {
    expect(chunkPumpOrder(4, 4)).toEqual([4, 0, 1, 2, 3]);
  });
  it("single-chunk video", () => {
    expect(chunkPumpOrder(0, 0)).toEqual([0]);
  });
  it("clamps an out-of-range start into [0, maxChunk]", () => {
    expect(chunkPumpOrder(9, 2)).toEqual([2, 0, 1]);
    expect(chunkPumpOrder(-1, 1)).toEqual([0, 1]);
  });
  it("is empty when maxChunk is negative (no lines)", () => {
    expect(chunkPumpOrder(0, -1)).toEqual([]);
  });
});
