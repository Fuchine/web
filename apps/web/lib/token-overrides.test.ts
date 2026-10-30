import { describe, expect, it } from "vitest";
import type { Token } from "@fuchine/db";
import { correctLine, MAX_OVERRIDE_TOKENS, parseOverrideBody } from "./token-overrides";

const tok = (surface: string, reading: string | null): Token => ({
  surface, lemma: surface, reading, romaji: null, pos: "名詞", wordEntryId: null,
});

describe("parseOverrideBody", () => {
  it("normalizes readings and defaults lemma", () => {
    const r = parseOverrideBody({ startIdx: 0, endIdx: 1, tokens: [{ surface: "10分", reading: "ジュップン" }] });
    expect(r).toEqual({
      ok: true,
      value: {
        startIdx: 0, endIdx: 1,
        tokens: [{ surface: "10分", lemma: "10分", reading: "じゅっぷん", pos: null, wordEntryId: undefined }],
      },
    });
  });

  it("reads a kana-only surface as itself and keeps an explicit null entry", () => {
    const r = parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: [{ surface: "マーク", wordEntryId: null }] });
    expect(r.ok && r.value.tokens[0]).toMatchObject({ reading: "まーく", wordEntryId: null });
  });

  it("rejects bad shapes", () => {
    expect(parseOverrideBody(null).ok).toBe(false);
    expect(parseOverrideBody({ startIdx: "0", endIdx: 0, tokens: [{ surface: "a" }] }).ok).toBe(false);
    expect(parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: [] }).ok).toBe(false);
    expect(parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: [{ surface: "" }] }).ok).toBe(false);
    expect(parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: [{ surface: "大", reading: "dai" }] })).toEqual({
      ok: false, error: "reading must be hiragana",
    });
    expect(parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: [{ surface: "大", wordEntryId: "x" }] }).ok).toBe(false);
    expect(parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: [{ surface: "x".repeat(65) }] }).ok).toBe(false);
    const many = Array.from({ length: MAX_OVERRIDE_TOKENS + 1 }, () => ({ surface: "あ" }));
    expect(parseOverrideBody({ startIdx: 0, endIdx: 0, tokens: many }).ok).toBe(false);
  });
});

describe("correctLine", () => {
  const line = [tok("マー", "まー"), tok("ク", "く"), tok("です", "です")];

  it("passes an uncorrected line through without spans", () => {
    expect(correctLine(line, undefined)).toEqual({ tokens: line });
    expect(correctLine(null, [])).toEqual({ tokens: [] });
  });

  it("applies a correction and reports spans", () => {
    const r = correctLine(line, [{ startIdx: 0, endIdx: 1, tokens: [tok("マーク", "まーく")] }]);
    expect(r.tokens.map((t) => t.surface)).toEqual(["マーク", "です"]);
    expect(r.tokenSpans).toEqual([
      { start: 0, end: 1, corrected: true },
      { start: 2, end: 2, corrected: false },
    ]);
  });

  it("ignores a stale correction (line re-tokenized)", () => {
    const r = correctLine([tok("マーク", "まーく")], [{ startIdx: 0, endIdx: 1, tokens: [tok("マーク", "まーく")] }]);
    expect(r).toEqual({ tokens: [tok("マーク", "まーく")] });
  });
});
