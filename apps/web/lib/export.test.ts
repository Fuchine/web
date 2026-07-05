import { describe, it, expect } from "vitest";
import { buildDeckTsv, clipUrl, type DeckCard } from "./export";

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

  it("handles null translation and an empty deck", () => {
    expect(buildDeckTsv([]).split("\n").filter(Boolean)).toHaveLength(3); // headers only
    const row = buildDeckTsv([{ ...card, translation: null }]).trimEnd().split("\n").pop()!.split("\t");
    expect(row[1]).toBe("");
  });
});
