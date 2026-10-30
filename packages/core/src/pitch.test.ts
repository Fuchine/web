import { describe, expect, it } from "vitest";
import { pitchCategories, pitchCategory, pitchPattern, splitMorae } from "./pitch";

const hl = (reading: string, n: number) =>
  pitchPattern(reading, n)!.high.map((h) => (h ? "H" : "L")).join("");

describe("splitMorae", () => {
  it("one mora per plain kana", () => {
    expect(splitMorae("はし")).toEqual(["は", "し"]);
  });
  it("small ゃゅょ join the previous mora", () => {
    expect(splitMorae("きょう")).toEqual(["きょ", "う"]);
    expect(splitMorae("しゃしん")).toEqual(["しゃ", "し", "ん"]);
  });
  it("small katakana vowels join too (ファ, ティ)", () => {
    expect(splitMorae("ファイル")).toEqual(["ファ", "イ", "ル"]);
    expect(splitMorae("パーティー")).toEqual(["パ", "ー", "ティ", "ー"]);
  });
  it("っ, ー and ん are morae", () => {
    expect(splitMorae("がっこう")).toEqual(["が", "っ", "こ", "う"]);
    expect(splitMorae("コーヒー")).toEqual(["コ", "ー", "ヒ", "ー"]);
    expect(splitMorae("にほん")).toEqual(["に", "ほ", "ん"]);
  });
  it("a leading small kana stands alone instead of vanishing", () => {
    expect(splitMorae("ゃあ")).toEqual(["ゃ", "あ"]);
  });
});

describe("pitchPattern — the はし minimal triple", () => {
  it("箸 はし 1 → atamadaka HL, particle low", () => {
    const p = pitchPattern("はし", 1)!;
    expect(p.category).toBe("atamadaka");
    expect(hl("はし", 1)).toBe("HL");
    expect(p.particleHigh).toBe(false);
    expect(p.dropAfter).toBe(0);
  });
  it("橋 はし 2 → odaka LH, particle low", () => {
    const p = pitchPattern("はし", 2)!;
    expect(p.category).toBe("odaka");
    expect(hl("はし", 2)).toBe("LH");
    expect(p.particleHigh).toBe(false);
    expect(p.dropAfter).toBe(1);
  });
  it("端 はし 0 → heiban LH, particle high", () => {
    const p = pitchPattern("はし", 0)!;
    expect(p.category).toBe("heiban");
    expect(hl("はし", 0)).toBe("LH");
    expect(p.particleHigh).toBe(true);
    expect(p.dropAfter).toBeNull();
  });
});

describe("pitchPattern — more words", () => {
  it("日本 にほん 2 → nakadaka LHL", () => {
    expect(pitchPattern("にほん", 2)!.category).toBe("nakadaka");
    expect(hl("にほん", 2)).toBe("LHL");
  });
  it("学校 がっこう 0 → heiban LHHH", () => {
    expect(hl("がっこう", 0)).toBe("LHHH");
  });
  it("コーヒー 3 → nakadaka LHHL", () => {
    expect(pitchPattern("コーヒー", 3)!.category).toBe("nakadaka");
    expect(hl("コーヒー", 3)).toBe("LHHL");
  });
  it("今日 きょう 1 → atamadaka over 2 morae (きょ is one)", () => {
    const p = pitchPattern("きょう", 1)!;
    expect(p.morae).toEqual(["きょ", "う"]);
    expect(hl("きょう", 1)).toBe("HL");
  });
  it("one-mora words: 日 ひ 0 is L + high particle; 木 き 1 is H", () => {
    expect(hl("ひ", 0)).toBe("L");
    expect(pitchPattern("ひ", 0)!.particleHigh).toBe(true);
    expect(pitchPattern("き", 1)!.category).toBe("atamadaka");
  });
  it("out-of-range downstep → null", () => {
    expect(pitchPattern("はし", 3)).toBeNull();
    expect(pitchPattern("はし", -1)).toBeNull();
    expect(pitchPattern("", 0)).toBeNull();
  });
});

describe("pitchCategory / pitchCategories", () => {
  it("classifies by position and length", () => {
    expect(pitchCategory(3, 0)).toBe("heiban");
    expect(pitchCategory(3, 1)).toBe("atamadaka");
    expect(pitchCategory(3, 2)).toBe("nakadaka");
    expect(pitchCategory(3, 3)).toBe("odaka");
    expect(pitchCategory(3, 4)).toBeNull();
  });
  it("distinct categories in order, skipping invalid positions", () => {
    expect(pitchCategories("にっぽん", [3, 0, 3, 9])).toEqual(["nakadaka", "heiban"]);
  });
});
