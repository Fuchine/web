import { describe, it, expect } from "vitest";
import type { Explanation, Token } from "@fuchine/db";
import { buildUncuratedPage, phraseRank } from "./phrases";
import { decodeListCursor } from "./list-query";

const tok = (wordEntryId: string | null): Token => ({
  surface: "猫", lemma: "猫", reading: "ねこ", romaji: "neko", pos: "noun", wordEntryId,
});

const row = (cardId: string, lineId: string, createdAt: Date, tokens: Token[] | null = [tok("w1")]) => ({
  cardId, createdAt, lineId, textOriginal: "猫が好き", textTranslation: "I like cats", tokens,
  tStartMs: 1000, tEndMs: 3500, videoId: "v1", videoTitle: "Cats", source: "youtube", sourceId: "abcdefghijk",
});

const explanation: Explanation = { breakdown: [], plainTerms: "I like cats." };

describe("buildUncuratedPage", () => {
  it("attaches the cached explanation by line, null when none is cached", () => {
    const page = buildUncuratedPage(
      [row("c1", "l1", new Date(2000)), row("c2", "l2", new Date(1000))],
      [{ lineId: "l2", content: explanation }],
      [],
      false,
    );
    expect(page.items.map((i) => i.explanation)).toEqual([null, explanation]);
  });

  it("returns one shared dictionary map and normalizes null tokens", () => {
    const page = buildUncuratedPage(
      [row("c1", "l1", new Date(2000), null)],
      [],
      [{ id: "w1", reading: null, lemma: "猫", pos: null, definitions: [], frequencyRank: 500 }],
      false,
    );
    expect(page.items[0]!.tokens).toEqual([]);
    expect(page.wordEntries).toEqual({
      w1: { reading: "", lemma: "猫", pos: "", definitions: [], frequencyRank: 500 },
    });
  });

  it("emits a keyset cursor from the last row only when there is more", () => {
    const rows = [row("c1", "l1", new Date(2000)), row("00000000-0000-4000-8000-000000000002", "l2", new Date(1000))];
    expect(buildUncuratedPage(rows, [], [], false).nextCursor).toBeNull();
    const cursor = buildUncuratedPage(rows, [], [], true).nextCursor!;
    expect(decodeListCursor(cursor)).toEqual([1000, "00000000-0000-4000-8000-000000000002"]);
  });
});

describe("phraseRank", () => {
  it("ranks a new card in the 'new' group", () => {
    expect(phraseRank(0, new Date(0), new Date())).toBe(2);
  });
});
