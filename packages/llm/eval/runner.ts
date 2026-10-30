// Eval runner (T3.12): gold items → subject (the model under test) → checks.
// The subject returns the model's raw response so the checks can measure what
// production's coercion would silently fix. Network-free in tests (fake
// subject, or the real subject over a stubbed fetch).

import { AsyncLocalStorage } from "node:async_hooks";
import type { SubtitleLineCtx } from "../src/contract";
import { createProvider, type ProviderConfig } from "../src/providers";
import { setUsageSink, type UsageRecord } from "../src/usage";
import { evaluateItem, type ItemOutput, type ItemResult } from "./checks";
import type { GoldItem } from "./gold";

export type EvalSubject = {
  provider: string;
  model: string;
  baseUrl?: string;
  explainRaw(ctx: SubtitleLineCtx, explanationLanguage: string): Promise<ItemOutput>;
};

export type UsageTotals = { calls: number; inTokens: number; outTokens: number; ms: number };

export function goldToCtx(item: GoldItem): SubtitleLineCtx {
  return {
    text: item.line,
    prevText: item.prev ?? null,
    nextText: item.next ?? null,
    tokens: item.tokens ?? [],
    learningLanguage: item.learningLanguage ?? "ja",
  };
}

/** Run every item through the subject (bounded concurrency, stable order). */
export async function runEval(
  items: GoldItem[],
  subject: EvalSubject,
  opts: { concurrency?: number; onItem?: (r: ItemResult, done: number) => void } = {},
): Promise<ItemResult[]> {
  const results: ItemResult[] = new Array(items.length);
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      const item = items[i]!;
      let out: ItemOutput;
      try {
        out = await subject.explainRaw(goldToCtx(item), item.explanationLanguage ?? "en");
      } catch (err) {
        out = { raw: null, error: (err as Error).message };
      }
      results[i] = evaluateItem(item, out);
      opts.onItem?.(results[i]!, ++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return results;
}

/**
 * The real subject: an LlmProvider from the production factory, with a fetch
 * tap that records the raw `choices[0].message.content` per call (scoped with
 * AsyncLocalStorage so concurrent items don't mix). The prompt sent is exactly
 * production's (provider.explainLine → buildExplainMessages).
 */
export function createProviderSubject(config: ProviderConfig): EvalSubject & { usage: UsageTotals } {
  const provider = createProvider(config);
  const store = new AsyncLocalStorage<{ raw: string | null }>();
  const usage: UsageTotals = { calls: 0, inTokens: 0, outTokens: 0, ms: 0 };

  // Collect token/latency totals for the report instead of logging each call.
  setUsageSink((r: UsageRecord) => {
    if (r.fn !== "explainLine") return;
    usage.calls++;
    usage.inTokens += r.inTokens ?? 0;
    usage.outTokens += r.outTokens ?? 0;
    usage.ms += r.ms;
  });

  const innerFetch = globalThis.fetch;
  const tappedFetch: typeof fetch = async (input, init) => {
    const res = await innerFetch(input, init);
    const holder = store.getStore();
    if (holder && res.ok) {
      try {
        const data = (await res.clone().json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === "string") holder.raw = content;
      } catch {
        /* not a chat-completions body; leave raw unset */
      }
    }
    return res;
  };
  globalThis.fetch = tappedFetch;

  return {
    provider: config.provider,
    model: config.model ?? "(provider default)",
    baseUrl: config.baseUrl,
    usage,
    async explainRaw(ctx, explanationLanguage) {
      const holder = { raw: null as string | null };
      try {
        const ex = await store.run(holder, () => provider.explainLine(ctx, { explanationLanguage }));
        // Non-HTTP providers: fall back to the coerced object (loss unmeasurable).
        return { raw: holder.raw ?? JSON.stringify(ex) };
      } catch (err) {
        // Invalid JSON still produced content — grade it rather than dropping it.
        if (holder.raw !== null) return { raw: holder.raw };
        return { raw: null, error: (err as Error).message };
      }
    },
  };
}
