// Layer-2 pre-warm (explain-ahead). Walks a video's subtitle lines in watch
// order and generates missing explanations through the shared cache, so a
// viewer rarely waits for the line they're on. Latency-insensitive by design:
// meant for the worker with the house provider, where a slow call only delays
// a background job.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  aiExplanations,
  llmUsage,
  subtitleLines,
  videos,
  type Database,
  type Token,
} from "@fuchine/db";
import { PROMPT_VERSION, type LlmProvider, type SubtitleLineCtx } from "./contract";
import { explainLineCached } from "./cache";

export type PrewarmLine = {
  id: string;
  idx: number;
  textOriginal: string;
  tokens: Token[] | null;
};

export type PrewarmItem = { lineId: string; ctx: SubtitleLineCtx };

/** Pair each line with its explain context; neighbors come from the ordered array. */
export function buildLineCtxs(
  lines: PrewarmLine[],
  learningLanguage: string,
): PrewarmItem[] {
  return lines.map((line, i) => ({
    lineId: line.id,
    ctx: {
      text: line.textOriginal,
      prevText: lines[i - 1]?.textOriginal ?? null,
      nextText: lines[i + 1]?.textOriginal ?? null,
      tokens: line.tokens ?? [],
      learningLanguage,
    },
  }));
}

/** Keep only items still missing from the cache, in watch order. */
export function planPrewarm(
  items: PrewarmItem[],
  cachedLineIds: Set<string>,
): PrewarmItem[] {
  return items.filter((it) => !cachedLineIds.has(it.lineId));
}

/**
 * Cap the eager pre-warm scope to the first `maxLines` in watch order (the start
 * of the video, where a viewer arrives first). `undefined`/negative = no cap.
 * Bounds the per-import cost of layer 2; the tail is covered on demand by the
 * player's prefetch as the viewer reaches it. (Pure — unit-tested.)
 */
export function scopePrewarm(items: PrewarmItem[], maxLines?: number): PrewarmItem[] {
  if (typeof maxLines !== "number" || maxLines < 0) return items;
  return items.slice(0, maxLines);
}

export type PrewarmScope = "head" | "full";

/**
 * Map a job's scope to the line cap. `full` warms the whole video (the tail
 * past the eager cap, enqueued on first player open); anything else keeps the
 * import-time head cap. (Pure — unit-tested.)
 */
export function resolveMaxLines(
  scope: PrewarmScope | undefined,
  headCap: number,
): number | undefined {
  return scope === "full" ? undefined : headCap;
}

export type PoolResult = { ok: number; failed: number };

/**
 * Run `fn` over `items` with at most `concurrency` in flight. Item failures
 * are counted, never thrown — one bad line must not sink the batch.
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<unknown>,
): Promise<PoolResult> {
  const result: PoolResult = { ok: 0, failed: 0 };
  let next = 0;
  const slots = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await fn(items[i]!);
        result.ok++;
      } catch {
        result.failed++;
      }
    }
  });
  await Promise.all(slots);
  return result;
}

export type VideoExplainSpend = { calls: number; inTokens: number; outTokens: number };

/**
 * Layer-2 spend attributed to a video: sums the `llm_usage` rows with
 * fn=explainLine and this videoId. Cumulative across runs — the number a cost
 * review wants is "what has this video cost", not one job's slice. Token sums
 * skip rows where the provider reported no usage; `calls` counts every attempt
 * (including failures — they cost real tokens even when unreported).
 */
export async function getVideoExplainSpend(
  db: Database,
  videoId: string,
): Promise<VideoExplainSpend> {
  const [row] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      inTokens: sql<number>`coalesce(sum(${llmUsage.inTokens}), 0)::int`,
      outTokens: sql<number>`coalesce(sum(${llmUsage.outTokens}), 0)::int`,
    })
    .from(llmUsage)
    .where(and(eq(llmUsage.videoId, videoId), eq(llmUsage.fn, "explainLine")));
  return row ?? { calls: 0, inTokens: 0, outTokens: 0 };
}

export type PrewarmSummary = {
  total: number;
  cached: number;
  generated: number;
  failed: number;
  /** Cumulative explain spend for the video; null when the usage query failed. */
  spend: VideoExplainSpend | null;
};

/**
 * Pre-generate a whole video's explanations. Idempotent: already-cached lines
 * are skipped (bulk check up front; explainLineCached double-checks per line).
 */
export async function prewarmVideoExplanations(
  db: Database,
  provider: LlmProvider,
  videoId: string,
  opts: { explanationLanguage: string; concurrency?: number; maxLines?: number },
): Promise<PrewarmSummary> {
  const [video] = await db
    .select({ language: videos.language })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video) throw new Error(`prewarm: video ${videoId} not found`);

  const lines = await db
    .select({
      id: subtitleLines.id,
      idx: subtitleLines.idx,
      textOriginal: subtitleLines.textOriginal,
      tokens: subtitleLines.tokens,
    })
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, videoId))
    .orderBy(asc(subtitleLines.idx));

  // Build contexts over the full ordered set (so neighbors are correct), then
  // cap the scope. Only the scoped lines are cache-checked and generated.
  const items = scopePrewarm(buildLineCtxs(lines, video.language), opts.maxLines);
  const scopedIds = items.map((it) => it.lineId);

  const cachedRows = scopedIds.length
    ? await db
        .select({ subtitleLineId: aiExplanations.subtitleLineId })
        .from(aiExplanations)
        .where(
          and(
            inArray(aiExplanations.subtitleLineId, scopedIds),
            eq(aiExplanations.kind, "line"),
            eq(aiExplanations.explanationLanguage, opts.explanationLanguage),
            eq(aiExplanations.promptVersion, PROMPT_VERSION),
          ),
        )
    : [];
  const cachedIds = new Set(cachedRows.map((r) => r.subtitleLineId));

  const todo = planPrewarm(items, cachedIds);
  const { ok, failed } = await runPool(todo, opts.concurrency ?? 2, (it) =>
    explainLineCached(db, provider, it.lineId, it.ctx, {
      explanationLanguage: opts.explanationLanguage,
      // Background/house call: attribute the cost to the video (no user).
      meta: { videoId },
    }),
  );
  // Spend is telemetry: it must never fail a prewarm that just succeeded.
  // The usage sink inserts fire-and-forget, so the very last calls of this run
  // may not be committed yet — a slight undercount, fine for a cost signal.
  const spend = await getVideoExplainSpend(db, videoId).catch(() => null);

  // `total` is the scoped set (what this job set out to warm), so
  // cached + generated + failed reconcile with it.
  return { total: items.length, cached: cachedIds.size, generated: ok, failed, spend };
}
