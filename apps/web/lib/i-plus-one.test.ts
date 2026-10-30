import { describe, it, expect } from "vitest";
import type { Token } from "@fuchine/db";
import { detectIPlusOne, I_PLUS_ONE_MIN_KNOWN } from "./i-plus-one";
import type { WordTier } from "./known-words";

const tok = (surface: string, wordEntryId: string | null, pos = "名詞", posDetail?: string): Token => ({
  surface, lemma: surface, reading: null, romaji: null, pos, wordEntryId, ...(posDetail ? { posDetail } : {}),
});
const tiers = (o: Record<string, WordTier>) => new Map(Object.entries(o));
const noPos = new Map<string, string | null>();

describe("detectIPlusOne", () => {
  const line = [tok("毎朝", "a"), tok("川沿い", "b"), tok("を", "c", "助詞"), tok("歩く", "d", "動詞"), tok("。", null, "記号")];

  it("flags a line with exactly one unknown countable word", () => {
    expect(detectIPlusOne(line, "ja", noPos, tiers({ a: "confirmed", c: "likely", d: "confirmed" }))).toEqual({ wordEntryId: "b", tokenIdx: 1 });
  });

  it("is not i+1 with zero or two unknown words", () => {
    expect(detectIPlusOne(line, "ja", noPos, tiers({ a: "confirmed", b: "likely", c: "likely", d: "confirmed" }))).toBeNull();
    expect(detectIPlusOne(line, "ja", noPos, tiers({ a: "confirmed", c: "likely" }))).toBeNull();
  });

  it("counts a repeated unknown word once (still one new item)", () => {
    const rep = [tok("猫", "x"), tok("が", "c", "助詞"), tok("猫", "x"), tok("好き", "d")];
    expect(detectIPlusOne(rep, "ja", noPos, tiers({ c: "confirmed", d: "likely" }))).toEqual({ wordEntryId: "x", tokenIdx: 0 });
  });

  it("ignores non-countable tokens: proper nouns, interjections, numerals, entry-less", () => {
    const l = [
      tok("田中", "n", "名詞", "固有名詞"), tok("さん", "s", "名詞"), tok("ああ", "i", "感動詞"), tok("３", "num"),
      tok("は", "c", "助詞"), tok("先生", "t"), tok("だ", "d", "助動詞"), tok("ｗｗ", null),
    ];
    expect(detectIPlusOne(l, "ja", noPos, tiers({ s: "confirmed", c: "confirmed", d: "likely" }))).toEqual({ wordEntryId: "t", tokenIdx: 5 });
  });

  it("uses the entry POS exclusions (int / n-pr / num)", () => {
    const l = [tok("ほう", "e"), tok("が", "c", "助詞"), tok("いい", "d"), tok("ね", "f", "助詞")];
    const pos = new Map<string, string | null>([["e", "int"]]);
    expect(detectIPlusOne(l, "ja", pos, tiers({ c: "confirmed", d: "confirmed" }))).toEqual({ wordEntryId: "f", tokenIdx: 3 });
  });

  it(`needs at least ${I_PLUS_ONE_MIN_KNOWN} known words around the new one`, () => {
    const short = [tok("猫", "x"), tok("だ", "d", "助動詞")];
    expect(detectIPlusOne(short, "ja", noPos, tiers({ d: "confirmed" }))).toBeNull();
    expect(detectIPlusOne(short, "ja", noPos, tiers({ d: "confirmed" }), 1)).toEqual({ wordEntryId: "x", tokenIdx: 0 });
  });
});
