import { describe, it, expect } from "vitest";
import { freqTier, detectMode } from "./dictionary";

describe("freqTier", () => {
  it("returns 0 for null/unranked", () => {
    expect(freqTier(null)).toBe(0);
  });
  it("maps low ranks to high tiers (lower rank = more frequent)", () => {
    expect(freqTier(1)).toBe(5);
    expect(freqTier(1500)).toBe(5);
    expect(freqTier(1501)).toBe(4);
    expect(freqTier(5000)).toBe(4);
    expect(freqTier(5001)).toBe(3);
    expect(freqTier(15000)).toBe(3);
    expect(freqTier(15001)).toBe(2);
    expect(freqTier(30000)).toBe(2);
    expect(freqTier(30001)).toBe(1);
    expect(freqTier(999999)).toBe(1);
  });
});

describe("detectMode", () => {
  it("Japanese text → ja", () => {
    expect(detectMode("猫")).toBe("ja");
    expect(detectMode("ねこ")).toBe("ja");
    expect(detectMode("カタカナ")).toBe("ja");
  });
  it("English / romaji → en", () => {
    expect(detectMode("walk")).toBe("en");
    expect(detectMode("to eat")).toBe("en");
  });
  it("any Japanese char wins in a mixed string", () => {
    expect(detectMode("猫cat")).toBe("ja");
  });
});
