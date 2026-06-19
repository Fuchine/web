// Layer 2 cache (D3, CONTRATO_IA §5). Key:
// (subtitle_line_id, kind, explanation_language, prompt_version).
// The model is NOT part of the key — explanations are reused across providers.

import { and, eq } from "drizzle-orm";
import { aiExplanations, type Database, type Explanation } from "@fuchine/db";
import {
  PROMPT_VERSION,
  type ExplanationKind,
  type LlmProvider,
  type SubtitleLineCtx,
} from "./contract";
import { RateLimitError } from "./errors";

export type CacheKey = {
  subtitleLineId: string;
  kind: ExplanationKind;
  explanationLanguage: string;
  promptVersion: number;
};

/** Read a cached explanation, or null on miss. */
export async function getCachedExplanation(
  db: Database,
  key: CacheKey,
): Promise<Explanation | null> {
  const rows = await db
    .select({ content: aiExplanations.content })
    .from(aiExplanations)
    .where(
      and(
        eq(aiExplanations.subtitleLineId, key.subtitleLineId),
        eq(aiExplanations.kind, key.kind),
        eq(aiExplanations.explanationLanguage, key.explanationLanguage),
        eq(aiExplanations.promptVersion, key.promptVersion),
      ),
    )
    .limit(1);
  return rows[0]?.content ?? null;
}

/** Persist an explanation. `model` is informational only (not in the key). */
export async function saveExplanation(
  db: Database,
  key: CacheKey,
  content: Explanation,
  model: string | null,
): Promise<void> {
  await db
    .insert(aiExplanations)
    .values({
      subtitleLineId: key.subtitleLineId,
      kind: key.kind,
      explanationLanguage: key.explanationLanguage,
      promptVersion: key.promptVersion,
      model,
      content,
    })
    .onConflictDoUpdate({
      target: [
        aiExplanations.subtitleLineId,
        aiExplanations.kind,
        aiExplanations.explanationLanguage,
        aiExplanations.promptVersion,
      ],
      set: { content, model },
    });
}

/**
 * Cache-first explanation: serve from `ai_explanations` if present, otherwise
 * call the provider and store the result. The whole point of layer 2.
 * On provider failure, retries up to 3 times with exponential backoff.
 */
export async function explainLineCached(
  db: Database,
  provider: LlmProvider,
  subtitleLineId: string,
  ctx: SubtitleLineCtx,
  opts: { explanationLanguage: string; kind?: ExplanationKind; model?: string; force?: boolean },
): Promise<Explanation> {
  const key: CacheKey = {
    subtitleLineId,
    kind: opts.kind ?? "line",
    explanationLanguage: opts.explanationLanguage,
    promptVersion: PROMPT_VERSION,
  };

  if (!opts.force) {
    const cached = await getCachedExplanation(db, key);
    if (cached) return cached;
  }

  const fresh = await callWithRetry(() =>
    provider.explainLine(ctx, { explanationLanguage: opts.explanationLanguage }),
  );
  await saveExplanation(db, key, fresh, opts.model ?? null);
  return fresh;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const delay = err instanceof RateLimitError
        ? (2 ** attempt) * 2000 // 2s, 4s, 8s for rate limits
        : (2 ** attempt) * 500;  // 0.5s, 1s, 2s for other errors
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
