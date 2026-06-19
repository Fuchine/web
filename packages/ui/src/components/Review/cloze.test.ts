import { describe, expect, test } from "vitest";
import { splitSentence, type SentencePart } from "./cloze";

const target = (surface: string) => ({
  surface,
  reading: "",
  lemma: "",
  meanings: [],
});

function blanks(parts: SentencePart[]) {
  return parts.filter((p) => p.isTarget);
}

function rebuild(parts: SentencePart[]) {
  return parts.map((p) => p.text).join("");
}

describe("splitSentence", () => {
  test("blanks the only occurrence of the target", () => {
    const parts = splitSentence("歩いています", target("ています"));
    expect(parts).toEqual([
      { text: "歩い", isTarget: false },
      { text: "ています", isTarget: true },
    ]);
  });

  test("blanks only the LAST occurrence when target repeats, keeping earlier ones visible", () => {
    const parts = splitSentence("音楽N5、N6です。頑張り音楽", target("音楽"));
    // exactly one blank
    expect(blanks(parts)).toHaveLength(1);
    // reconstructing all parts yields the original sentence (no duplication)
    expect(rebuild(parts)).toBe("音楽N5、N6です。頑張り音楽");
    // the blank is the last occurrence
    expect(parts).toEqual([
      { text: "音楽N5、N6です。頑張り", isTarget: false },
      { text: "音楽", isTarget: true },
    ]);
  });

  test("handles target in the middle with text on both sides", () => {
    const parts = splitSentence("私は日本語を勉強している", target("ている"));
    expect(blanks(parts)).toHaveLength(1);
    expect(rebuild(parts)).toBe("私は日本語を勉強している");
    expect(parts).toEqual([
      { text: "私は日本語を勉強し", isTarget: false },
      { text: "ている", isTarget: true },
    ]);
  });

  test("target appearing 3+ times only blanks the last", () => {
    const parts = splitSentence("猫猫猫", target("猫"));
    expect(blanks(parts)).toHaveLength(1);
    expect(rebuild(parts)).toBe("猫猫猫");
    expect(parts).toEqual([
      { text: "猫猫", isTarget: false },
      { text: "猫", isTarget: true },
    ]);
  });

  test("returns the whole sentence unblanked when target is absent", () => {
    const parts = splitSentence("こんにちは", target("さようなら"));
    expect(blanks(parts)).toHaveLength(0);
    expect(parts).toEqual([{ text: "こんにちは", isTarget: false }]);
  });
});
