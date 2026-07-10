import { describe, it, expect } from "vitest";
import { validateImportRequest, CAPTIONS_MAX, TEXT_MAX, CHANNEL_MAX } from "./import";

const URL = "https://youtu.be/abcdefghijk"; // 11-char id
const cap = (over: Partial<{ text: string; startMs: number; endMs: number; idx: number }> = {}) => ({
  text: over.text ?? "line",
  startMs: over.startMs ?? 0,
  endMs: over.endMs ?? 1000,
  idx: over.idx,
});

describe("validateImportRequest", () => {
  it("rejects a missing url", () => {
    const r = validateImportRequest({ captions: [cap()] });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an unrecognizable YouTube url", () => {
    const r = validateImportRequest({ url: "https://example.com/x", captions: [cap()] });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a payload over the caption cap", () => {
    const captions = Array.from({ length: CAPTIONS_MAX + 1 }, () => cap());
    const r = validateImportRequest({ url: URL, captions });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(r.error).toMatch(/caption/i);
  });

  it("accepts a payload exactly at the caption cap", () => {
    const captions = Array.from({ length: CAPTIONS_MAX }, () => cap());
    const r = validateImportRequest({ url: URL, captions });
    expect(r.ok).toBe(true);
  });

  it("truncates overlong caption text to the per-line cap", () => {
    const r = validateImportRequest({ url: URL, captions: [cap({ text: "x".repeat(TEXT_MAX + 50) })] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rows[0]!.textOriginal.length).toBe(TEXT_MAX);
  });

  it("swaps endMs < startMs instead of persisting a negative span", () => {
    const r = validateImportRequest({ url: URL, captions: [cap({ startMs: 5000, endMs: 2000 })] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rows[0]!.tStartMs).toBe(2000);
      expect(r.value.rows[0]!.tEndMs).toBe(5000);
    }
  });

  it("drops empty/whitespace captions and trims text", () => {
    const r = validateImportRequest({
      url: URL,
      captions: [cap({ text: "  hi  " }), cap({ text: "   " }), cap({ text: "" })],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rows).toHaveLength(1);
      expect(r.value.rows[0]!.textOriginal).toBe("hi");
    }
  });

  it("defaults idx to array position and language to ja", () => {
    const r = validateImportRequest({ url: URL, captions: [cap(), cap()] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rows.map((x) => x.idx)).toEqual([0, 1]);
      expect(r.value.language).toBe("ja");
    }
  });

  it("nulls an out-of-range durationS but keeps a valid one", () => {
    const bad = validateImportRequest({ url: URL, durationS: 999_999, captions: [cap()] });
    const good = validateImportRequest({ url: URL, durationS: 3600, captions: [cap()] });
    expect(bad.ok && bad.value.durationS).toBe(null);
    expect(good.ok && good.value.durationS).toBe(3600);
  });

  it("normalizes the URL to the canonical YouTube watch URL", () => {
    const r = validateImportRequest({ url: "https://youtu.be/abcdefghijk?t=30", captions: [cap()] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });

  it("truncates channel to CHANNEL_MAX and nulls empty/whitespace", () => {
    const long = validateImportRequest({ url: URL, channel: "x".repeat(CHANNEL_MAX + 50), captions: [cap()] });
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.value.channel).toHaveLength(CHANNEL_MAX);

    const blank = validateImportRequest({ url: URL, channel: "   ", captions: [cap()] });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.channel).toBeNull();
  });
});
