import { describe, it, expect } from "vitest";
import { nfRankFromTags, mapWord } from "./mapper";
import type { JmdictWord } from "./jmdict-types";

describe("nfRankFromTags", () => {
  it("maps an nf band to its midpoint rank", () => {
    expect(nfRankFromTags(["nf01"])).toBe(250);
    expect(nfRankFromTags(["nf02"])).toBe(750);
    expect(nfRankFromTags(["nf48"])).toBe(23_750);
  });
  it("picks the most frequent (lowest) band present", () => {
    expect(nfRankFromTags(["nf10", "nf03", "news1"])).toBe(1250); // nf03
  });
  it("ignores non-nf priority tags", () => {
    expect(nfRankFromTags(["news1", "ichi1", "spec1"])).toBeNull();
    expect(nfRankFromTags([])).toBeNull();
  });
});

const sense = [{ partOfSpeech: ["n"], misc: [], field: [], dialect: [], gloss: [{ lang: "eng", text: "thing" }] }];

describe("mapWord — nfRank", () => {
  it("ranks a kanji form by its own nf tag", () => {
    const w: JmdictWord = {
      id: "1",
      kanji: [{ text: "日本", common: true, tags: ["nf01"] }],
      kana: [{ text: "にほん", common: true, tags: ["nf01"] }],
      sense,
    };
    expect(mapWord(w)[0]!.nfRank).toBe(250);
  });

  it("falls back to the primary reading's nf when the kanji form has none", () => {
    const w: JmdictWord = {
      id: "2",
      kanji: [{ text: "稀な書き方", common: false, tags: [] }],
      kana: [{ text: "まれ", common: true, tags: ["nf12"] }],
      sense,
    };
    expect(mapWord(w)[0]!.nfRank).toBe(5750); // nf12 midpoint
  });

  it("ranks a kana-only entry by its own tag, null when unmarked", () => {
    const marked: JmdictWord = { id: "3", kanji: [], kana: [{ text: "から", common: true, tags: ["nf05"] }], sense };
    expect(mapWord(marked)[0]!.nfRank).toBe(2250);
    const bare: JmdictWord = { id: "4", kanji: [], kana: [{ text: "ゑ", common: false, tags: [] }], sense };
    expect(mapWord(bare)[0]!.nfRank).toBeNull();
  });
});
