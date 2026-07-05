import { describe, it, expect } from "vitest";
import { parseProgressInput, countWordOccurrences } from "./progress";
import type { Token } from "@fuchine/db";

describe("parseProgressInput", () => {
  it("accepts watched ms plus line ids", () => {
    const r = parseProgressInput({ msWatched: 15000, lineIds: ["a", "b"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.msWatched).toBe(15000);
    expect(r.value.lineIds).toEqual(["a", "b"]);
  });

  it("accepts watched ms alone (paused on one line)", () => {
    const r = parseProgressInput({ msWatched: 5000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lineIds).toEqual([]);
  });

  it("rejects an empty beacon (nothing to record)", () => {
    expect(parseProgressInput({}).ok).toBe(false);
    expect(parseProgressInput({ msWatched: 0, lineIds: [] }).ok).toBe(false);
  });

  it("rejects negative, fractional, or non-numeric msWatched", () => {
    expect(parseProgressInput({ msWatched: -1 }).ok).toBe(false);
    expect(parseProgressInput({ msWatched: 10.5 }).ok).toBe(false);
    expect(parseProgressInput({ msWatched: "9000" }).ok).toBe(false);
  });

  it("caps msWatched per beacon (anti-abuse)", () => {
    expect(parseProgressInput({ msWatched: 600_001 }).ok).toBe(false);
    expect(parseProgressInput({ msWatched: 600_000 }).ok).toBe(true);
  });

  it("rejects non-string line ids and caps the batch size", () => {
    expect(parseProgressInput({ msWatched: 1000, lineIds: [42] }).ok).toBe(false);
    expect(parseProgressInput({ msWatched: 1000, lineIds: Array(501).fill("x") }).ok).toBe(false);
  });

  it("dedupes line ids", () => {
    const r = parseProgressInput({ lineIds: ["a", "a", "b"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lineIds).toEqual(["a", "b"]);
  });

  it("rejects a non-object body", () => {
    expect(parseProgressInput(null).ok).toBe(false);
    expect(parseProgressInput("nope").ok).toBe(false);
  });
});

describe("countWordOccurrences", () => {
  const tok = (wordEntryId: string | null): Token =>
    ({ surface: "x", lemma: "x", reading: null, romaji: null, pos: "noun", wordEntryId });

  it("counts every occurrence per word across lines", () => {
    const counts = countWordOccurrences([
      [tok("w1"), tok("w2"), tok("w1")],
      [tok("w1")],
    ]);
    expect(counts.get("w1")).toBe(3);
    expect(counts.get("w2")).toBe(1);
  });

  it("ignores tokens without a dictionary entry", () => {
    const counts = countWordOccurrences([[tok(null), tok("w1")]]);
    expect(counts.size).toBe(1);
    expect(counts.get("w1")).toBe(1);
  });

  it("is empty for no lines", () => {
    expect(countWordOccurrences([]).size).toBe(0);
  });
});
