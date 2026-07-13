import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logLlmUsage, setUsageSink, type UsageRecord } from "./usage";
import { dbUsageSink } from "./usage-db";

describe("usage sink dispatch", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards context + metrics to the registered sink with a timestamp", () => {
    const seen: UsageRecord[] = [];
    setUsageSink((r) => seen.push(r));

    logLlmUsage(
      { fn: "explainLine", provider: "minimax", model: "m3", videoId: "v1", lineId: "l1" },
      { inTokens: 100, outTokens: 40, ms: 12, ok: true },
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      fn: "explainLine",
      provider: "minimax",
      videoId: "v1",
      lineId: "l1",
      inTokens: 100,
      outTokens: 40,
      ok: true,
    });
    expect(typeof seen[0]!.ts).toBe("string");
  });
});

describe("dbUsageSink", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a record to the llm_usage row, nulling missing attribution", () => {
    let inserted: Record<string, unknown> | null = null;
    const fakeDb = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted = v;
          return { catch: () => {} };
        },
      }),
    };

    const sink = dbUsageSink(fakeDb as never);
    sink({
      fn: "translateBatch",
      provider: "deepl",
      ms: 8,
      ok: false,
      ts: new Date().toISOString(),
    });

    expect(inserted).toMatchObject({
      fn: "translateBatch",
      provider: "deepl",
      userId: null,
      videoId: null,
      lineId: null,
      model: null,
      inTokens: null,
      outTokens: null,
      ms: 8,
      ok: false,
    });
  });
});
