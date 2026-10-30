import { describe, expect, it } from "vitest";
import type { Token } from "@fuchine/db";
import {
  applyTokenOverrides,
  applyTokenOverridesDetailed,
  buildOverrideEdit,
  editBlock,
  identitySpans,
  isHiraganaReading,
  isNoopOverride,
  mergeTokens,
  splitToken,
  TokenOverrideError,
  validateTokenOverride,
} from "./token-overrides";

const tok = (surface: string, reading: string | null, extra: Partial<Token> = {}): Token => ({
  surface,
  lemma: surface,
  reading,
  romaji: null,
  pos: "名詞",
  wordEntryId: null,
  ...extra,
});

describe("applyTokenOverrides", () => {
  it("merges a name split at ー (マー + ク → マーク)", () => {
    const line = [tok("マー", "まー"), tok("ク", "く"), tok("さん", "さん")];
    const out = applyTokenOverrides(line, [
      { startIdx: 0, endIdx: 1, tokens: [tok("マーク", "まーく", { pos: "固有名詞" })] },
    ]);
    expect(out.map((t) => t.surface)).toEqual(["マーク", "さん"]);
    expect(out[0]!.reading).toBe("まーく");
  });

  it("merges a split counter (1 + 0分 → 10分 read じゅっぷん)", () => {
    const line = [tok("1", "いち"), tok("0分", "ぜろふん"), tok("待つ", "まつ")];
    const out = applyTokenOverrides(line, [
      { startIdx: 0, endIdx: 1, tokens: [tok("10分", "じゅっぷん")] },
    ]);
    expect(out[0]).toMatchObject({ surface: "10分", reading: "じゅっぷん" });
    expect(out).toHaveLength(2);
  });

  it("fixes a reading in place (大きく おうきく → おおきく)", () => {
    const line = [tok("大きく", "おうきく", { lemma: "大きい" }), tok("なる", "なる")];
    const out = applyTokenOverrides(line, [
      { startIdx: 0, endIdx: 0, tokens: [tok("大きく", "おおきく", { lemma: "大きい" })] },
    ]);
    expect(out[0]!.reading).toBe("おおきく");
    expect(out[0]!.lemma).toBe("大きい");
    expect(out[1]).toBe(line[1]);
  });

  it("maps a proper noun to a dictionary entry", () => {
    const line = [tok("東京", "とうきょう"), tok("へ", "へ")];
    const out = applyTokenOverrides(line, [
      { startIdx: 0, endIdx: 0, tokens: [tok("東京", "とうきょう", { wordEntryId: "e-tokyo" })] },
    ]);
    expect(out[0]!.wordEntryId).toBe("e-tokyo");
  });

  it("splits one token into two", () => {
    const line = [tok("食べ過ぎ", "たべすぎ")];
    const out = applyTokenOverrides(line, [
      { startIdx: 0, endIdx: 0, tokens: [tok("食べ", "たべ"), tok("過ぎ", "すぎ")] },
    ]);
    expect(out.map((t) => t.surface)).toEqual(["食べ", "過ぎ"]);
  });

  it("rejects an override that changes the line text", () => {
    const line = [tok("マー", "まー"), tok("ク", "く")];
    expect(() => applyTokenOverrides(line, [{ startIdx: 0, endIdx: 1, tokens: [tok("マーケ", null)] }]))
      .toThrow(TokenOverrideError);
    expect(validateTokenOverride(line, { startIdx: 0, endIdx: 1, tokens: [tok("マーケ", null)] }))
      .toMatch(/マーク/);
  });

  it("rejects out-of-range, empty and overlapping overrides", () => {
    const line = [tok("あ", "あ"), tok("い", "い"), tok("う", "う")];
    expect(validateTokenOverride(line, { startIdx: 2, endIdx: 3, tokens: [tok("う", "う")] })).toMatch(/outside/);
    expect(validateTokenOverride(line, { startIdx: 1, endIdx: 0, tokens: [tok("い", "い")] })).toMatch(/span/);
    expect(validateTokenOverride(line, { startIdx: 0, endIdx: 0, tokens: [] })).toMatch(/non-empty/);
    expect(validateTokenOverride(line, { startIdx: 0, endIdx: 0, tokens: [tok("", null), tok("あ", "あ")] }))
      .toMatch(/surface/);
    expect(() => applyTokenOverrides(line, [
      { startIdx: 0, endIdx: 1, tokens: [tok("あい", "あい")] },
      { startIdx: 1, endIdx: 2, tokens: [tok("いう", "いう")] },
    ])).toThrow(/overlap/);
  });

  it("applies several overrides in start order and reports spans", () => {
    const line = [tok("マー", "まー"), tok("ク", "く"), tok("と", "と"), tok("1", "いち"), tok("0分", null)];
    const r = applyTokenOverridesDetailed(line, [
      { startIdx: 3, endIdx: 4, tokens: [tok("10分", "じゅっぷん")] },
      { startIdx: 0, endIdx: 1, tokens: [tok("マーク", "まーく")] },
    ]);
    expect(r.tokens.map((t) => t.surface)).toEqual(["マーク", "と", "10分"]);
    expect(r.spans).toEqual([
      { start: 0, end: 1, corrected: true },
      { start: 2, end: 2, corrected: false },
      { start: 3, end: 4, corrected: true },
    ]);
  });

  it("lenient mode skips a stale override instead of throwing", () => {
    const line = [tok("マーク", "まーく")];
    const stale = { startIdx: 0, endIdx: 1, tokens: [tok("マーク", "まーく")] };
    const r = applyTokenOverridesDetailed(line, [stale]);
    expect(r.tokens).toEqual(line);
    expect(r.skipped).toEqual([stale]);
  });
});

describe("editor helpers", () => {
  it("merges and splits tokens", () => {
    expect(mergeTokens(tok("マー", "まー"), tok("ク", "く"))).toMatchObject({
      surface: "マーク", lemma: "マーク", reading: "まーく", wordEntryId: null,
    });
    const [a, b] = splitToken(tok("食べ過ぎ", "たべすぎ"), 2);
    expect([a.surface, b.surface]).toEqual(["食べ", "過ぎ"]);
    expect(a.reading).toBeNull(); // has kanji: the user types it
    expect(splitToken(tok("マーク", "まーく"), 2)[1].reading).toBe("く");
    expect(() => splitToken(tok("あ", "あ"), 1)).toThrow(TokenOverrideError);
  });

  it("validates hiragana readings", () => {
    expect(isHiraganaReading("じゅっぷん")).toBe(true);
    expect(isHiraganaReading("まーく")).toBe(true);
    expect(isHiraganaReading("ジュップン")).toBe(false);
    expect(isHiraganaReading("")).toBe(false);
  });

  it("builds an override covering whole correction blocks", () => {
    const line = [tok("マー", "まー"), tok("ク", "く"), tok("と", "と")];
    // Fresh merge of corrected 0 + 1 → original span [0, 1].
    const first = buildOverrideEdit(line, identitySpans(3), 0, 1, [mergeTokens(line[0]!, line[1]!)]);
    expect(first).toMatchObject({ startIdx: 0, endIdx: 1 });
    expect(first.tokens.map((t) => t.surface)).toEqual(["マーク"]);

    // A split correction [0,1] → two tokens; editing the second extends to
    // the whole block and keeps the first.
    const applied = applyTokenOverridesDetailed(line, [
      { startIdx: 0, endIdx: 1, tokens: [tok("マ", "ま"), tok("ーク", "ーく")] },
    ]);
    expect(editBlock(applied.spans, 1, 1)).toEqual([0, 1]);
    const second = buildOverrideEdit(applied.tokens, applied.spans, 1, 2, [tok("ークと", null)]);
    expect(second).toMatchObject({ startIdx: 0, endIdx: 2 });
    expect(second.tokens.map((t) => t.surface)).toEqual(["マ", "ークと"]);
    expect(validateTokenOverride(line, second)).toBeNull();
  });

  it("detects a no-op override", () => {
    const line = [tok("大きく", "おうきく")];
    expect(isNoopOverride(line, { startIdx: 0, endIdx: 0, tokens: [tok("大きく", "おうきく")] })).toBe(true);
    expect(isNoopOverride(line, { startIdx: 0, endIdx: 0, tokens: [tok("大きく", "おおきく")] })).toBe(false);
  });
});
