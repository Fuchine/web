import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FallbackProvider } from "./fallback";
import { ProviderError, RateLimitError } from "../errors";
import type { LlmProvider, SubtitleLineCtx } from "../contract";
import type { Explanation } from "@fuchine/db";

const ctx: SubtitleLineCtx = {
  text: "布巾。",
  prevText: null,
  nextText: null,
  tokens: [],
  learningLanguage: "ja",
};
const explanation = { breakdown: [], plainTerms: "ok" } as Explanation;
const opts = { from: "ja", to: "en" };

function fake(over: Partial<LlmProvider> & { name?: string }): LlmProvider & { name?: string } {
  return {
    name: over.name,
    translateBatch: over.translateBatch ?? vi.fn(async (lines: string[]) => lines.map(() => "t")),
    explainLine: over.explainLine ?? vi.fn(async () => explanation),
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FallbackProvider.translateBatch", () => {
  it("uses the primary when it succeeds; fallback never called", async () => {
    const fb = fake({ name: "echo" });
    const p = new FallbackProvider(fake({ name: "deepl" }), fb);
    expect(await p.translateBatch(["a", "b"], opts)).toEqual(["t", "t"]);
    expect(fb.translateBatch).not.toHaveBeenCalled();
  });

  it("falls back on RateLimitError and warns", async () => {
    const p = new FallbackProvider(
      fake({ name: "deepl", translateBatch: vi.fn(async () => { throw new RateLimitError("quota"); }) }),
      fake({ name: "echo", translateBatch: vi.fn(async (l: string[]) => l.map(() => "fb")) }),
    );
    expect(await p.translateBatch(["a"], opts)).toEqual(["fb"]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("falls back on ProviderError (provider down / bad key)", async () => {
    const p = new FallbackProvider(
      fake({ translateBatch: vi.fn(async () => { throw new ProviderError("503"); }) }),
      fake({ translateBatch: vi.fn(async (l: string[]) => l.map(() => "fb")) }),
    );
    expect(await p.translateBatch(["a"], opts)).toEqual(["fb"]);
  });

  it("rethrows non-LlmError without touching the fallback", async () => {
    const fb = fake({});
    const p = new FallbackProvider(
      fake({ translateBatch: vi.fn(async () => { throw new TypeError("bug"); }) }),
      fb,
    );
    await expect(p.translateBatch(["a"], opts)).rejects.toThrow(TypeError);
    expect(fb.translateBatch).not.toHaveBeenCalled();
  });

  it("propagates the fallback's error when both fail", async () => {
    const p = new FallbackProvider(
      fake({ translateBatch: vi.fn(async () => { throw new RateLimitError("quota"); }) }),
      fake({ translateBatch: vi.fn(async () => { throw new ProviderError("also down"); }) }),
    );
    await expect(p.translateBatch(["a"], opts)).rejects.toThrow("also down");
  });
});

describe("FallbackProvider.explainLine", () => {
  it("delegates straight to the fallback (primary may be MT-only)", async () => {
    const primary = fake({});
    const p = new FallbackProvider(primary, fake({}));
    expect(await p.explainLine(ctx, { explanationLanguage: "en" })).toEqual(explanation);
    expect(primary.explainLine).not.toHaveBeenCalled();
  });
});

describe("FallbackProvider.name", () => {
  it("composes both names for logs", () => {
    expect(new FallbackProvider(fake({ name: "deepl" }), fake({ name: "echo" })).name).toBe(
      "fallback(deepl→echo)",
    );
  });
});
