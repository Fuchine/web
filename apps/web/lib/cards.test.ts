import { describe, it, expect } from "vitest";
import type { Token } from "@fuchine/db";
import { buildReviewQueuePayload, CARD_TYPES, MAX_NOTES_LENGTH, parseCardType, validateNotes, type ReviewQueueRow } from "./cards";

const tok = (wordEntryId: string | null): Token => ({
  surface: "猫", lemma: "猫", reading: "ねこ", romaji: "neko", pos: "noun", wordEntryId,
});

const row = (over: Partial<ReviewQueueRow> = {}): ReviewQueueRow => ({
  cardId: "c1", videoId: "v1", cardType: "listening", notes: null, due: new Date("2026-07-07T00:00:00Z"),
  stability: 1, difficulty: 5, lastReview: null, state: 0, reps: 0, lapses: 0, elapsedDays: 0, scheduledDays: 0,
  textOriginal: "猫が好き", textTranslation: "I like cats", tStartMs: 1000, tEndMs: 3500,
  source: "youtube", sourceId: "abcdefghijk", tokens: [tok("w1")],
  ...over,
});

const entry = (id: string) => ({
  id, reading: "ねこ", lemma: "猫", pos: "noun",
  definitions: [{ glosses: ["cat"], partsOfSpeech: ["noun"] }],
});

describe("buildReviewQueuePayload", () => {
  it("returns a single shared wordEntries map, not one per card", () => {
    const rows = [row({ cardId: "c1" }), row({ cardId: "c2" })];
    const payload = buildReviewQueuePayload(rows, [entry("w1")]);
    expect(Object.keys(payload)).toEqual(["cards", "wordEntries"]);
    expect(payload.cards).toHaveLength(2);
    // No per-card copy of the dictionary map anymore (that was the ~95% waste).
    for (const c of payload.cards) {
      expect(c).not.toHaveProperty("wordEntriesMap");
    }
    expect(payload.wordEntries.w1).toMatchObject({ lemma: "猫", pos: "noun" });
  });

  it("maps each row to its clip, sentence, tokens and FSRS preview intervals", () => {
    const { cards } = buildReviewQueuePayload([row()], [entry("w1")]);
    const c = cards[0]!;
    expect(c.clip).toEqual({ source: "youtube", sourceId: "abcdefghijk", startMs: 1000, endMs: 3500 });
    expect(c.sentence).toEqual({ text: "猫が好き", translation: "I like cats" });
    expect(c.tokens).toHaveLength(1);
    expect(c.intervals).toBeTruthy(); // previewIntervals(...) for all four grades
  });

  it("defaults null reading/pos to empty strings in the entry map", () => {
    const { wordEntries } = buildReviewQueuePayload(
      [row()],
      [{ id: "w1", reading: null, lemma: "猫", pos: null, definitions: [] }],
    );
    expect(wordEntries.w1).toMatchObject({ reading: "", pos: "" });
  });

  it("tolerates rows with null tokens", () => {
    const { cards } = buildReviewQueuePayload([row({ tokens: null })], []);
    expect(cards[0]!.tokens).toEqual([]);
  });
});

describe("validateNotes (B1)", () => {
  it("accepts absent, null, empty, and up-to-cap strings", () => {
    expect(validateNotes(undefined)).toBeNull();
    expect(validateNotes(null)).toBeNull();
    expect(validateNotes("")).toBeNull();
    expect(validateNotes("x".repeat(MAX_NOTES_LENGTH))).toBeNull();
  });

  it("rejects notes over the cap", () => {
    expect(MAX_NOTES_LENGTH).toBe(2000);
    expect(validateNotes("x".repeat(MAX_NOTES_LENGTH + 1))).toMatch(/at most 2000/);
  });

  it("rejects non-string notes", () => {
    expect(validateNotes(42)).toMatch(/must be a string/);
    expect(validateNotes({ a: 1 })).toMatch(/must be a string/);
  });
});

describe("parseCardType (B1 allowlist)", () => {
  it("defaults absent/blank to listening", () => {
    expect(parseCardType(undefined)).toEqual({ cardType: "listening" });
    expect(parseCardType(null)).toEqual({ cardType: "listening" });
    expect(parseCardType("  ")).toEqual({ cardType: "listening" });
  });

  it("accepts every allowlisted type (trimmed)", () => {
    for (const t of CARD_TYPES) expect(parseCardType(` ${t} `)).toEqual({ cardType: t });
  });

  it("rejects unknown or non-string types", () => {
    expect(parseCardType("cloze")).toHaveProperty("error");
    expect(parseCardType("x".repeat(10_000))).toHaveProperty("error");
    expect(parseCardType(1)).toHaveProperty("error");
  });
});
