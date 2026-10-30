import { describe, expect, test } from "vitest";
import { acceptedAnswers, checkClozeAnswer, normalizeAnswer, pickClozeTarget, type ClozeToken } from "./answer";
import { splitSentence } from "./cloze";

const benkyou = { surface: "勉強", reading: "べんきょう", lemma: "勉強", lemmaReading: "べんきょう" };
const futte = { surface: "降って", reading: "ふって", lemma: "降る", lemmaReading: "ふる" };

describe("normalizeAnswer", () => {
  test("katakana → hiragana, NFKC (half-width kana, full-width latin), trims spaces and punctuation", () => {
    expect(normalizeAnswer("ベンキョウ")).toBe("べんきょう");
    expect(normalizeAnswer("ﾍﾞﾝｷｮｳ")).toBe("べんきょう");
    expect(normalizeAnswer("  勉強。 ")).toBe("勉強");
    expect(normalizeAnswer("ＡＢＣ")).toBe("abc");
    expect(normalizeAnswer("ラーメン")).toBe("らーめん");
    expect(normalizeAnswer("　")).toBe("");
  });
});

describe("checkClozeAnswer", () => {
  test("accepts the surface, the reading in hiragana or katakana", () => {
    expect(checkClozeAnswer("勉強", benkyou)).toBe(true);
    expect(checkClozeAnswer("べんきょう", benkyou)).toBe(true);
    expect(checkClozeAnswer("ベンキョウ", benkyou)).toBe(true);
    expect(checkClozeAnswer(" 勉強 ", benkyou)).toBe(true);
  });

  test("accepts the dictionary form and its reading for an inflected word", () => {
    expect(checkClozeAnswer("降って", futte)).toBe(true);
    expect(checkClozeAnswer("ふって", futte)).toBe(true);
    expect(checkClozeAnswer("降る", futte)).toBe(true);
    expect(checkClozeAnswer("フル", futte)).toBe(true);
  });

  test("rejects wrong and empty answers", () => {
    expect(checkClozeAnswer("", benkyou)).toBe(false);
    expect(checkClozeAnswer("。", benkyou)).toBe(false);
    expect(checkClozeAnswer("勉", benkyou)).toBe(false);
    expect(checkClozeAnswer("べんきょ", benkyou)).toBe(false);
    expect(checkClozeAnswer("ふった", futte)).toBe(false);
  });

  test("acceptedAnswers is de-duplicated and skips empty readings", () => {
    expect(acceptedAnswers(benkyou)).toEqual(["勉強", "べんきょう"]);
    expect(acceptedAnswers({ surface: "猫", reading: "", lemma: "猫", lemmaReading: "" })).toEqual(["猫"]);
  });
});

describe("pickClozeTarget", () => {
  const tok = (surface: string, pos: string, wordEntryId: string | null, lemma = surface, reading: string | null = null): ClozeToken =>
    ({ surface, lemma, reading, pos, wordEntryId });

  const entries = {
    watashi: { reading: "わたし", lemma: "私", definitions: [{ glosses: ["I"] }], frequencyRank: 500 },
    nihongo: { reading: "にほんご", lemma: "日本語", definitions: [{ glosses: ["Japanese"] }], frequencyRank: 2000 },
    benkyou: { reading: "べんきょう", lemma: "勉強", definitions: [{ glosses: ["study"] }], frequencyRank: 1500 },
    iru: { reading: "いる", lemma: "いる", definitions: [{ glosses: ["to be"] }], frequencyRank: 500 },
  };
  const sentence = "私は日本語を勉強している";
  const tokens = [
    tok("私", "名詞", "watashi", "私", "わたし"),
    tok("は", "助詞", null),
    tok("日本語", "名詞", "nihongo", "日本語", "にほんご"),
    tok("を", "助詞", null),
    tok("勉強", "名詞", "benkyou", "勉強", "べんきょう"),
    tok("し", "動詞", null, "する", "し"),
    tok("て", "助詞", null),
    tok("いる", "動詞", "iru", "いる", "いる"),
  ];

  test("blanks the rarest dictionary word (highest frequency band)", () => {
    const t = pickClozeTarget(sentence, tokens, entries);
    expect(t).toMatchObject({ surface: "日本語", reading: "にほんご", lemma: "日本語", meanings: ["Japanese"] });
    // the cloze helper blanks it
    expect(splitSentence(sentence, t!).filter((p) => p.isTarget).map((p) => p.text)).toEqual(["日本語"]);
  });

  test("reports the chosen token's index and dictionary entry (Anki export target word)", () => {
    const t = pickClozeTarget(sentence, tokens, entries);
    expect(t?.tokenIndex).toBe(2);
    expect(t?.wordEntryId).toBe("nihongo");
    const bare = pickClozeTarget("ラーメンだ", [tok("ラーメン", "名詞", null, "ラーメン", "ラーメン")], {});
    expect(bare).toMatchObject({ tokenIndex: 0, wordEntryId: null });
  });

  test("an unranked entry counts as rarer than any ranked one", () => {
    const t = pickClozeTarget(sentence, tokens, { ...entries, benkyou: { ...entries.benkyou, frequencyRank: null } });
    expect(t?.surface).toBe("勉強");
  });

  test("without ranks, prefers longer then later words", () => {
    const noRank = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { ...v, frequencyRank: 1 }]));
    expect(pickClozeTarget(sentence, tokens, noRank)?.surface).toBe("日本語");
  });

  test("never blanks particles, auxiliaries or symbols", () => {
    const t = pickClozeTarget("ね。", [tok("ね", "助詞", null), tok("。", "記号", null)], {});
    expect(t).toBeNull();
  });

  test("falls back to a content word without an entry; reading from the token (katakana → hiragana)", () => {
    const t = pickClozeTarget("ラーメンだ", [tok("ラーメン", "名詞", null, "ラーメン", "ラーメン"), tok("だ", "助動詞", null)], {});
    expect(t).toMatchObject({ surface: "ラーメン", reading: "らーめん", lemma: "ラーメン", lemmaReading: "", meanings: [] });
  });

  test("ignores tokens whose surface is not in the line, and empty input", () => {
    expect(pickClozeTarget("猫", [tok("犬", "名詞", null)], {})).toBeNull();
    expect(pickClozeTarget("", [], {})).toBeNull();
  });
});
