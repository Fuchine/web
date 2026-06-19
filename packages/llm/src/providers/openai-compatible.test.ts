import { describe, it, expect } from "vitest";
import { coerceExplanation } from "./openai-compatible";

describe("coerceExplanation (v2)", () => {
  it("keeps a well-formed breakdown + plainTerms", () => {
    const out = coerceExplanation({
      breakdown: [
        { surface: "毎朝", tag: "adverb", gloss: "every morning", note: "sets the time." },
        { surface: "歩いて います", tag: "grammar", gloss: "~ている", note: "ongoing action.", accent: true },
      ],
      plainTerms: "Says they walk every morning.",
    });
    expect(out.breakdown).toHaveLength(2);
    expect(out.breakdown[1]).toMatchObject({ tag: "grammar", accent: true });
    expect(out.plainTerms).toBe("Says they walk every morning.");
  });

  it("coerces an unknown tag to 'expression' and drops empty-surface parts", () => {
    const out = coerceExplanation({
      breakdown: [
        { surface: "を", tag: "bogus", gloss: "obj", note: "x" },
        { surface: "", tag: "noun", gloss: "", note: "" },
      ],
      plainTerms: "",
    });
    expect(out.breakdown).toHaveLength(1);
    expect(out.breakdown[0]!.tag).toBe("expression");
  });

  it("caps the breakdown at 8 parts", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
      surface: `t${i}`, tag: "noun", gloss: "g", note: "n",
    }));
    expect(coerceExplanation({ breakdown: parts, plainTerms: "" }).breakdown).toHaveLength(8);
  });

  it("returns empty breakdown + empty plainTerms for garbage", () => {
    const out = coerceExplanation("not json");
    expect(out.breakdown).toEqual([]);
    expect(out.plainTerms).toBe("");
  });
});
