import { describe, it, expect } from "vitest";
import { coerceExplanation, boundedTranslateFallback } from "./openai-compatible";

describe("boundedTranslateFallback", () => {
  it("preserves order and translates every line on success", async () => {
    const out = await boundedTranslateFallback(
      ["a", "b", "c"],
      async (line) => line.toUpperCase(),
      { concurrency: 2 },
    );
    expect(out).toEqual(["A", "B", "C"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const lines = Array.from({ length: 10 }, (_, i) => String(i));
    await boundedTranslateFallback(
      lines,
      async (line) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return line;
      },
      { concurrency: 3 },
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("aborts early when the first calls all fail, bounding total calls", async () => {
    let calls = 0;
    const lines = Array.from({ length: 40 }, (_, i) => String(i));
    const out = await boundedTranslateFallback(
      lines,
      async () => {
        calls++;
        return null;
      },
      { concurrency: 3, abortAfter: 4 },
    );
    expect(out).toHaveLength(40); // still same-length (CONTRATO §3.2), rest null
    expect(calls).toBeLessThanOrEqual(4 + 3); // abortAfter + in-flight, not 40
    expect(calls).toBeLessThan(40);
  });

  it("does not abort once at least one line has translated", async () => {
    let calls = 0;
    const lines = Array.from({ length: 10 }, (_, i) => String(i));
    const out = await boundedTranslateFallback(
      lines,
      async (line) => {
        calls++;
        return line === "0" ? "ok" : null;
      },
      { concurrency: 1, abortAfter: 4 },
    );
    expect(calls).toBe(10); // one early success ⇒ finish the whole chunk
    expect(out[0]).toBe("ok");
  });
});

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
