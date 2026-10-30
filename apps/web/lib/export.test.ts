import { describe, it, expect } from "vitest";
import type { Token } from "@fuchine/db";
import {
  FREQ_SORT_UNKNOWN, LAPIS_FIELDS, boldSentence, buildDeckTsv, buildLapisTsv, cell, clipUrl,
  exportTarget, freqSortField, frequencyField, fsrsTags, furiganaWord, glossaryHtml, lapisNote,
  mainDefinition, parseExportParams, pitchCategoriesField, pitchPositionField, sentenceFurigana,
  type DeckCard, type ExportEntry, type LapisCard,
} from "./export";

describe("clipUrl", () => {
  it("builds a YouTube deep link with a whole-second timestamp", () => {
    expect(clipUrl("youtube", "abc123", 12_800)).toBe("https://www.youtube.com/watch?v=abc123&t=12s");
  });
  it("floors sub-second and clamps negatives to 0", () => {
    expect(clipUrl("youtube", "x", 400)).toBe("https://www.youtube.com/watch?v=x&t=0s");
    expect(clipUrl("youtube", "x", -50)).toBe("https://www.youtube.com/watch?v=x&t=0s");
  });
  it("returns empty for unknown sources", () => {
    expect(clipUrl("vimeo", "x", 1000)).toBe("");
  });
});

describe("buildDeckTsv", () => {
  const card: DeckCard = {
    text: "猫が好き",
    translation: "I like cats",
    notes: null,
    source: "youtube",
    sourceId: "abc",
    startMs: 3000,
  };

  it("emits the Anki header directives", () => {
    const out = buildDeckTsv([card]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("#separator:tab");
    expect(lines[1]).toBe("#html:true");
    expect(lines[2]).toBe("#columns:Expression\tMeaning\tNotes\tSource");
  });

  it("emits one tab-separated row per card with a clip link", () => {
    const out = buildDeckTsv([card]).trimEnd().split("\n");
    const row = out[out.length - 1]!.split("\t");
    expect(row[0]).toBe("猫が好き");
    expect(row[1]).toBe("I like cats");
    expect(row[2]).toBe("");
    expect(row[3]).toBe('<a href="https://www.youtube.com/watch?v=abc&t=3s">Watch on YouTube</a>');
  });

  it("flattens tabs and newlines so a field can't break the TSV grid", () => {
    const out = buildDeckTsv([{ ...card, notes: "line1\nline2\twith tab" }]);
    const row = out.trimEnd().split("\n").pop()!.split("\t");
    // notes is the 3rd column and must contain no raw tab/newline
    expect(row[2]).toBe("line1<br>line2 with tab");
    expect(row).toHaveLength(4);
  });

  it("HTML-escapes every text field (the deck is #html:true)", () => {
    const evil = `<img src=x onerror="alert(1)">`;
    const out = buildDeckTsv([{ ...card, text: evil, translation: `a & b`, notes: `"<b>"\nx` }]);
    const row = out.trimEnd().split("\n").pop()!.split("\t");
    expect(row[0]).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(row[1]).toBe("a &amp; b");
    // Newlines still become a real <br> (added after escaping).
    expect(row[2]).toBe("&quot;&lt;b&gt;&quot;<br>x");
    expect(out).not.toContain("<img");
  });

  it("cell() escapes & < > \" and keeps <br> for newlines", () => {
    expect(cell(`<script>&"\r\nok`)).toBe("&lt;script&gt;&amp;&quot;<br>ok");
    expect(cell(null)).toBe("");
  });

  it("handles null translation and an empty deck", () => {
    expect(buildDeckTsv([]).split("\n").filter(Boolean)).toHaveLength(3); // headers only
    const row = buildDeckTsv([{ ...card, translation: null }]).trimEnd().split("\n").pop()!.split("\t");
    expect(row[1]).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Lapis preset (T3.3)                                                 */
/* ------------------------------------------------------------------ */

const tk = (surface: string, reading: string | null, pos: string, wordEntryId: string | null = null, lemma = surface): Token =>
  ({ surface, lemma, reading, romaji: null, pos, wordEntryId });

describe("furiganaWord", () => {
  it("puts the reading on the kanji and keeps okurigana outside", () => {
    expect(furiganaWord("食べる", "たべる")).toBe(" 食[た]べる");
    expect(furiganaWord("お茶", "おちゃ")).toBe("お 茶[ちゃ]");
    expect(furiganaWord("日本語", "にほんご")).toBe(" 日本語[にほんご]");
  });
  it("reads katakana readings as hiragana", () => {
    expect(furiganaWord("勉強", "ベンキョウ")).toBe(" 勉強[べんきょう]");
  });
  it("leaves kana-only words and missing readings alone", () => {
    expect(furiganaWord("ラーメン", "らーめん")).toBe("ラーメン");
    expect(furiganaWord("猫", null)).toBe("猫");
    expect(furiganaWord("は", "は")).toBe("は");
  });
  it("HTML-escapes the surface", () => {
    expect(furiganaWord("<b>", null)).toBe("&lt;b&gt;");
  });
});

describe("sentenceFurigana / boldSentence", () => {
  const tokens = [tk("猫", "ねこ", "名詞"), tk("が", "が", "助詞"), tk("食べる", "たべる", "動詞")];
  it("builds Anki furigana for the line and bolds the target token", () => {
    expect(sentenceFurigana(tokens, null)).toBe("猫[ねこ]が 食[た]べる");
    expect(sentenceFurigana(tokens, 2)).toBe("猫[ねこ]が<b>食[た]べる</b>");
    expect(sentenceFurigana(tokens, 0)).toBe("<b>猫[ねこ]</b>が 食[た]べる");
  });
  it("bolds the right occurrence of a repeated word", () => {
    const t = [tk("猫", "ねこ", "名詞"), tk("と", "と", "助詞"), tk("猫", "ねこ", "名詞")];
    expect(boldSentence("猫と猫", t, 2)).toBe("猫と<b>猫</b>");
    expect(boldSentence("猫と猫", t, 0)).toBe("<b>猫</b>と猫");
  });
  it("escapes the text around the bold and falls back to plain text", () => {
    expect(boldSentence("<i>猫", [tk("<i>", null, "記号"), tk("猫", "ねこ", "名詞")], 1)).toBe("&lt;i&gt;<b>猫</b>");
    expect(boldSentence("猫", [], null)).toBe("猫");
  });
});

describe("dictionary fields", () => {
  const defs = [
    { glosses: ["cat"], partsOfSpeech: ["n"] },
    { glosses: ["geisha", "<shamisen> player"], partsOfSpeech: ["n"] },
  ];
  it("MainDefinition is the first sense; Glossary lists every sense", () => {
    expect(mainDefinition(defs)).toBe("cat");
    expect(glossaryHtml(defs)).toBe("<ol><li>cat</li><li>geisha; &lt;shamisen&gt; player</li></ol>");
    expect(mainDefinition([])).toBe("");
    expect(glossaryHtml([])).toBe("");
  });
  it("pitch fields: numeric positions, Lapis category names", () => {
    expect(pitchPositionField([0])).toBe("0");
    expect(pitchPositionField([0, 2, 0])).toBe("0,2");
    expect(pitchCategoriesField("ねこ", [1])).toBe("atamadaka");
    expect(pitchCategoriesField("にほんご", [0])).toBe("heiban");
    expect(pitchCategoriesField("たまご", [2, 0])).toBe("nakadaka,heiban");
    expect(pitchCategoriesField("おとうと", [4])).toBe("odaka");
    expect(pitchCategoriesField("", [1])).toBe("");
  });
  it("frequency fields", () => {
    expect(frequencyField(1500)).toBe('<ul style="text-align: left;"><li>JMdict: 1500</li></ul>');
    expect(frequencyField(null)).toBe("");
    expect(freqSortField(1500)).toBe("1500");
    expect(freqSortField(null)).toBe(String(FREQ_SORT_UNKNOWN));
  });
});

describe("fsrsTags", () => {
  it("carries state, due day, memory and counters", () => {
    expect(
      fsrsTags({ state: 2, due: new Date("2026-11-03T10:00:00Z"), stability: 12.3456, difficulty: 5.1, reps: 4, lapses: 1 }),
    ).toEqual([
      "fuchine::state::review", "fuchine::due::2026-11-03", "fuchine::stability::12.35",
      "fuchine::difficulty::5.1", "fuchine::reps::4", "fuchine::lapses::1",
    ]);
  });
  it("a new card has no due/memory tags", () => {
    expect(fsrsTags({ state: 0, due: new Date(), stability: 0, difficulty: 0, reps: 0, lapses: 0 }))
      .toEqual(["fuchine::state::new", "fuchine::reps::0", "fuchine::lapses::0"]);
  });
});

describe("parseExportParams", () => {
  const p = (q: string) => parseExportParams(new URLSearchParams(q));
  it("defaults to lapis / all / Fuchine / no history / tsv", () => {
    expect(p("")).toEqual({ ok: true, value: { preset: "lapis", filter: "all", deck: "Fuchine", history: false, format: "tsv" } });
  });
  it("accepts the documented values and cleans the deck name", () => {
    expect(p("preset=basic&filter=curated&history=1&deck=%20Japanese%3A%3AMining%0A")).toEqual({
      ok: true, value: { preset: "basic", filter: "curated", deck: "Japanese::Mining", history: true, format: "tsv" },
    });
  });
  it("rejects unknown values", () => {
    expect(p("preset=x").ok).toBe(false);
    expect(p("filter=x").ok).toBe(false);
    expect(p("format=xml").ok).toBe(false);
    expect(p("preset=basic&format=json").ok).toBe(false);
    expect(p(`deck=${"a".repeat(101)}`).ok).toBe(false);
  });
});

describe("Lapis notes", () => {
  const entries: Record<string, ExportEntry> = {
    neko: { lemma: "猫", reading: "ねこ", definitions: [{ glosses: ["cat"], partsOfSpeech: ["n"] }], frequencyRank: 2500, pitch: [1] },
    taberu: { lemma: "食べる", reading: "たべる", definitions: [{ glosses: ["to eat"], partsOfSpeech: ["v1"] }], frequencyRank: 500, pitch: [2] },
  };
  const card: LapisCard = {
    cardId: "11111111-1111-4111-8111-111111111111",
    sentence: "猫が食べる",
    translation: "The cat eats",
    notes: "my <note>",
    tokens: [tk("猫", "ねこ", "名詞", "neko"), tk("が", "が", "助詞"), tk("食べる", "たべる", "動詞", "taberu")],
    source: "youtube", sourceId: "abc", startMs: 61_500,
    videoTitle: "Cats & Dogs", channel: "Pets",
    fsrs: { state: 2, due: new Date("2026-11-03T00:00:00Z"), stability: 3, difficulty: 6, reps: 2, lapses: 0 },
  };

  it("target word = the review Cloze rule (rarest ranked content word)", () => {
    expect(exportTarget(card, entries)).toMatchObject({ surface: "猫", wordEntryId: "neko", tokenIndex: 0 });
  });

  it("fills every Lapis field", () => {
    const n = lapisNote(card, entries, { history: false });
    expect(n.guid).toBe("fuchine-11111111-1111-4111-8111-111111111111");
    expect(n.fields).toMatchObject({
      Expression: "猫",
      ExpressionFurigana: "猫[ねこ]",
      ExpressionReading: "ねこ",
      ExpressionAudio: "",
      SentenceAudio: "",
      Picture: "",
      MainDefinition: "cat",
      Sentence: "<b>猫</b>が食べる",
      SentenceFurigana: "<b>猫[ねこ]</b>が 食[た]べる",
      Glossary: "<ol><li>cat</li></ol>",
      IsSentenceCard: "x",
      IsClickCard: "",
      PitchPosition: "1",
      PitchCategories: "atamadaka",
      FreqSort: "2500",
      MiscInfo: 'The cat eats<br>my &lt;note&gt;<br><a href="https://www.youtube.com/watch?v=abc&t=61s">Cats &amp; Dogs</a> · Pets',
    });
    expect(n.tags).toEqual(["fuchine", "fuchine::video::Cats_&_Dogs"]);
    expect(Object.keys(n.fields)).toEqual([...LAPIS_FIELDS]);
  });

  it("history adds the FSRS tags", () => {
    expect(lapisNote(card, entries, { history: true }).tags).toContain("fuchine::due::2026-11-03");
  });

  it("a line with nothing to target keeps the sentence as Expression", () => {
    const n = lapisNote({ ...card, sentence: "ね。", tokens: [tk("ね", "ね", "助詞"), tk("。", null, "記号")] }, {}, { history: false });
    expect(n.fields.Expression).toBe("ね。");
    expect(n.fields.Sentence).toBe("ね。");
    expect(n.fields.FreqSort).toBe(String(FREQ_SORT_UNKNOWN));
  });

  it("TSV: Anki headers, one row per card, no field breaks the grid, nothing unescaped", () => {
    const evil = { ...card, sentence: "<img src=x onerror=alert(1)>\t猫", notes: "a\nb" };
    const out = buildLapisTsv([card, evil], entries, { deck: "Japanese::Mining", history: true });
    const lines = out.trimEnd().split("\n");
    expect(lines.slice(0, 7)).toEqual([
      "#separator:tab", "#html:true", "#notetype:Lapis", "#deck:Japanese::Mining",
      `#columns:${[...LAPIS_FIELDS, "Tags", "GUID"].join("\t")}`, "#tags column:23", "#guid column:24",
    ]);
    const rows = lines.slice(7).map((l) => l.split("\t"));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toHaveLength(24);
    expect(rows[0]![22]).toContain("fuchine::state::review");
    expect(rows[0]![23]).toBe("fuchine-11111111-1111-4111-8111-111111111111");
    expect(out).not.toContain("<img");
  });
});
