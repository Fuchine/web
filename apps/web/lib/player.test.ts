import { describe, it, expect } from "vitest";
import { pickCurrentLine, formatTimecode, lineHasAudio, isSfxLine } from "./player";

const LINES = [
  { id: "a", idx: 0, tStartMs: 1000, tEndMs: 2500, textOriginal: "a", textTranslation: "A", tokens: [] },
  { id: "b", idx: 1, tStartMs: 3000, tEndMs: 5000, textOriginal: "b", textTranslation: null, tokens: [] },
  { id: "c", idx: 2, tStartMs: 6000, tEndMs: 8000, textOriginal: "c", textTranslation: "C", tokens: [] },
];

describe("pickCurrentLine", () => {
  it("returns -1 when lines is empty", () => {
    expect(pickCurrentLine([], 1000)).toBe(-1);
  });
  it("returns -1 when ms is before the first start", () => {
    expect(pickCurrentLine(LINES, 500)).toBe(-1);
  });
  it("returns the index of the line containing ms", () => {
    expect(pickCurrentLine(LINES, 2000)).toBe(0);
    expect(pickCurrentLine(LINES, 4000)).toBe(1);
    expect(pickCurrentLine(LINES, 7000)).toBe(2);
  });
  it("returns -1 at the upper boundary (ms === tEndMs, no next line starts there)", () => {
    expect(pickCurrentLine(LINES, 2500)).toBe(-1);
    expect(pickCurrentLine(LINES, 5000)).toBe(-1);
  });
  it("returns the index when ms === tStartMs of a line", () => {
    expect(pickCurrentLine(LINES, 3000)).toBe(1);
    expect(pickCurrentLine(LINES, 6000)).toBe(2);
  });
  it("returns -1 after the last line", () => {
    expect(pickCurrentLine(LINES, 9000)).toBe(-1);
  });
});

describe("formatTimecode", () => {
  it("formats 0 as 0:00", () => {
    expect(formatTimecode(0)).toBe("0:00");
  });
  it("formats 61s as 1:01", () => {
    expect(formatTimecode(61_000)).toBe("1:01");
  });
  it("formats 1h 2m 5s as 1:02:05", () => {
    expect(formatTimecode(3_725_000)).toBe("1:02:05");
  });
  it("formats 1h 1m 1s as 1:01:01", () => {
    expect(formatTimecode(3_661_000)).toBe("1:01:01");
  });
});

describe("lineHasAudio", () => {
  it("returns false for degenerate lines (< 100ms)", () => {
    expect(lineHasAudio({ ...LINES[0], tEndMs: 1050 })).toBe(false);
  });
  it("returns true for normal lines (>= 100ms)", () => {
    expect(lineHasAudio(LINES[0])).toBe(true);
  });
});

describe("isSfxLine", () => {
  it("returns true when textOriginal starts with ♪", () => {
    expect(isSfxLine({ ...LINES[0], textOriginal: "♪ music ♪" })).toBe(true);
  });
  it("returns true even with leading whitespace", () => {
    expect(isSfxLine({ ...LINES[0], textOriginal: "  ♪ sigh" })).toBe(true);
  });
  it("returns false for normal dialogue", () => {
    expect(isSfxLine(LINES[0])).toBe(false);
  });
});
