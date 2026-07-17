import { describe, it, expect } from "vitest";
import {
  buildLineCtxs,
  getVideoExplainSpend,
  planPrewarm,
  resolveMaxLines,
  runPool,
  scopePrewarm,
  type PrewarmLine,
} from "./prewarm";

const line = (id: string, idx: number, text: string): PrewarmLine => ({
  id,
  idx,
  textOriginal: text,
  tokens: [],
});

describe("buildLineCtxs", () => {
  it("pairs each line with its neighbors from the ordered array", () => {
    const items = buildLineCtxs(
      [line("a", 0, "一"), line("b", 1, "二"), line("c", 2, "三")],
      "ja",
    );
    expect(items.map((i) => i.lineId)).toEqual(["a", "b", "c"]);
    expect(items[0]!.ctx).toMatchObject({ text: "一", prevText: null, nextText: "二" });
    expect(items[1]!.ctx).toMatchObject({ text: "二", prevText: "一", nextText: "三" });
    expect(items[2]!.ctx).toMatchObject({ text: "三", prevText: "二", nextText: null });
    expect(items[0]!.ctx.learningLanguage).toBe("ja");
  });

  it("defaults null tokens to an empty array", () => {
    const items = buildLineCtxs(
      [{ id: "a", idx: 0, textOriginal: "一", tokens: null }],
      "ja",
    );
    expect(items[0]!.ctx.tokens).toEqual([]);
  });
});

describe("planPrewarm", () => {
  it("skips cached lines and keeps watch order", () => {
    const items = buildLineCtxs(
      [line("a", 0, "一"), line("b", 1, "二"), line("c", 2, "三")],
      "ja",
    );
    const todo = planPrewarm(items, new Set(["b"]));
    expect(todo.map((i) => i.lineId)).toEqual(["a", "c"]);
  });
});

describe("scopePrewarm", () => {
  const items = buildLineCtxs(
    [line("a", 0, "一"), line("b", 1, "二"), line("c", 2, "三")],
    "ja",
  );

  it("caps to the first N in watch order", () => {
    expect(scopePrewarm(items, 2).map((i) => i.lineId)).toEqual(["a", "b"]);
  });

  it("preserves correct neighbors within the cap (ctx built over the full set)", () => {
    // The last kept line still sees its real next line, not null.
    expect(scopePrewarm(items, 2)[1]!.ctx.nextText).toBe("三");
  });

  it("returns everything when the cap exceeds the count", () => {
    expect(scopePrewarm(items, 99)).toHaveLength(3);
  });

  it("no cap when maxLines is undefined or negative", () => {
    expect(scopePrewarm(items)).toHaveLength(3);
    expect(scopePrewarm(items, -1)).toHaveLength(3);
  });

  it("caps to zero (warm nothing eagerly)", () => {
    expect(scopePrewarm(items, 0)).toHaveLength(0);
  });
});

describe("resolveMaxLines", () => {
  it("uncaps the whole video for the full (first-open) scope", () => {
    expect(resolveMaxLines("full", 150)).toBeUndefined();
  });

  it("keeps the head cap for the head scope and the default", () => {
    expect(resolveMaxLines("head", 150)).toBe(150);
    expect(resolveMaxLines(undefined, 150)).toBe(150);
  });
});

describe("getVideoExplainSpend", () => {
  const fakeDb = (rows: unknown[]) =>
    ({
      select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    }) as never;

  it("returns the aggregated row", async () => {
    const spend = await getVideoExplainSpend(
      fakeDb([{ calls: 3, inTokens: 1200, outTokens: 500 }]),
      "v1",
    );
    expect(spend).toEqual({ calls: 3, inTokens: 1200, outTokens: 500 });
  });

  it("falls back to zeros when the aggregate yields no row", async () => {
    expect(await getVideoExplainSpend(fakeDb([]), "v1")).toEqual({
      calls: 0,
      inTokens: 0,
      outTokens: 0,
    });
  });
});

describe("runPool", () => {
  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runPool([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(maxInFlight).toBe(2);
  });

  it("counts failures without throwing and keeps going", async () => {
    const result = await runPool([1, 2, 3, 4], 2, async (n) => {
      if (n % 2 === 0) throw new Error("boom");
    });
    expect(result).toEqual({ ok: 2, failed: 2 });
  });

  it("handles an empty list", async () => {
    expect(await runPool([], 3, async () => {})).toEqual({ ok: 0, failed: 0 });
  });
});
