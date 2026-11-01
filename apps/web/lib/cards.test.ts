import { describe, it, expect, beforeAll } from "vitest";
import type { Token } from "@fuchine/db";
import { createFsrs, type FsrsService } from "@fuchine/core";
import { buildReviewQueuePayload, CARD_TYPES, MAX_NOTES_LENGTH, parseCardType, servableDueCount, validateNotes, type ReviewQueueRow } from "./cards";

const tok = (wordEntryId: string | null): Token => ({
  surface: "猫", lemma: "猫", reading: "ねこ", romaji: "neko", pos: "noun", wordEntryId,
});

const row = (over: Partial<ReviewQueueRow> = {}): ReviewQueueRow => ({
  cardId: "c1", videoId: "v1", cardType: "listening", notes: null, due: new Date("2026-07-07T00:00:00Z"),
  stability: 0, stabilityFast: 0, difficulty: 0, lastReview: null, state: 0, reps: 0, lapses: 0,
  elapsedDays: 0, scheduledDays: 0, learningStep: 0, fsrsModel: "fsrs-7",
  textOriginal: "猫が好き", textTranslation: "I like cats", tStartMs: 1000, tEndMs: 3500,
  source: "youtube", sourceId: "abcdefghijk", tokens: [tok("w1")],
  ...over,
});

const entry = (id: string) => ({
  id, reading: "ねこ", lemma: "猫", pos: "noun",
  definitions: [{ glosses: ["cat"], partsOfSpeech: ["noun"] }],
});

let fsrs: FsrsService;
beforeAll(async () => {
  fsrs = await createFsrs();
});

describe("buildReviewQueuePayload", () => {
  it("returns a single shared wordEntries map, not one per card", () => {
    const rows = [row({ cardId: "c1" }), row({ cardId: "c2" })];
    const payload = buildReviewQueuePayload(rows, [entry("w1")], fsrs);
    expect(Object.keys(payload)).toEqual(["cards", "wordEntries"]);
    expect(payload.cards).toHaveLength(2);
    // No per-card copy of the dictionary map anymore (that was the ~95% waste).
    for (const c of payload.cards) {
      expect(c).not.toHaveProperty("wordEntriesMap");
    }
    expect(payload.wordEntries.w1).toMatchObject({ lemma: "猫", pos: "noun" });
  });

  it("maps each row to its clip, sentence, tokens and FSRS preview intervals", () => {
    const { cards } = buildReviewQueuePayload([row()], [entry("w1")], fsrs);
    const c = cards[0]!;
    expect(c.clip).toEqual({ source: "youtube", sourceId: "abcdefghijk", startMs: 1000, endMs: 3500 });
    expect(c.sentence).toEqual({ text: "猫が好き", translation: "I like cats" });
    expect(c.tokens).toHaveLength(1);
    // FSRS preview for all four grades, Again soonest.
    expect(c.intervals[1].getTime()).toBeLessThanOrEqual(c.intervals[3].getTime());
  });

  it("defaults null reading/pos to empty strings in the entry map", () => {
    const { wordEntries } = buildReviewQueuePayload(
      [row()],
      [{ id: "w1", reading: null, lemma: "猫", pos: null, definitions: [] }],
      fsrs,
    );
    expect(wordEntries.w1).toMatchObject({ reading: "", pos: "", frequencyRank: null });
  });

  it("carries the frequency rank so the cloze mode can blank the rarest word", () => {
    const { wordEntries } = buildReviewQueuePayload([row()], [{ ...entry("w1"), frequencyRank: 3500 }], fsrs);
    expect(wordEntries.w1!.frequencyRank).toBe(3500);
  });

  it("tolerates rows with null tokens", () => {
    const { cards } = buildReviewQueuePayload([row({ tokens: null })], [], fsrs);
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

describe("servableDueCount (review badge)", () => {
  it("caps due new cards at the remaining new allowance", () => {
    // 50 freshly mined cards, default 10/day, nothing introduced yet → 10.
    expect(servableDueCount({ reviews: 0, newCards: 50 }, { newRemaining: 10, reviewRemaining: null })).toBe(10);
  });

  it("adds every due review when maxReviewsPerDay is unset", () => {
    expect(servableDueCount({ reviews: 34, newCards: 50 }, { newRemaining: 10, reviewRemaining: null })).toBe(44);
  });

  it("caps due reviews by the remaining review allowance when set", () => {
    expect(servableDueCount({ reviews: 34, newCards: 3 }, { newRemaining: 10, reviewRemaining: 20 })).toBe(23);
  });

  it("shows nothing once both of today's allowances are spent", () => {
    expect(servableDueCount({ reviews: 2, newCards: 50 }, { newRemaining: 0, reviewRemaining: 0 })).toBe(0);
  });

  it("never exceeds what is actually due", () => {
    expect(servableDueCount({ reviews: 1, newCards: 2 }, { newRemaining: 10, reviewRemaining: 5 })).toBe(3);
  });
});
