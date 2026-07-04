// Layer-2 pre-warm (explain-ahead). Walks a video's subtitle lines in watch
// order and generates missing explanations through the shared cache, so a
// viewer rarely waits for the line they're on. Latency-insensitive by design:
// meant for the worker with the house provider, where a slow call only delays
// a background job.

import { and, asc, eq, inArray } from "drizzle-orm";
import {
  aiExplanations,
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

export type PrewarmSummary = {
  total: number;
  cached: number;
  generated: number;
  failed: number;
};

/**
 * Pre-generate a whole video's explanations. Idempotent: already-cached lines
 * are skipped (bulk check up front; explainLineCached double-checks per line).
 */
export async function prewarmVideoExplanations(
  db: Database,
  provider: LlmProvider,
  videoId: string,
  opts: { explanationLanguage: string; concurrency?: number },
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

  const cachedRows = lines.length
    ? await db
        .select({ subtitleLineId: aiExplanations.subtitleLineId })
        .from(aiExplanations)
        .where(
          and(
            inArray(
              aiExplanations.subtitleLineId,
              lines.map((l) => l.id),
            ),
            eq(aiExplanations.kind, "line"),
            eq(aiExplanations.explanationLanguage, opts.explanationLanguage),
            eq(aiExplanations.promptVersion, PROMPT_VERSION),
          ),
        )
    : [];
  const cachedIds = new Set(cachedRows.map((r) => r.subtitleLineId));

  const todo = planPrewarm(buildLineCtxs(lines, video.language), cachedIds);
  const { ok, failed } = await runPool(todo, opts.concurrency ?? 2, (it) =>
    explainLineCached(db, provider, it.lineId, it.ctx, {
      explanationLanguage: opts.explanationLanguage,
    }),
  );
  return { total: lines.length, cached: cachedIds.size, generated: ok, failed };
}
