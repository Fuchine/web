// Layer 2 cache (D3, CONTRATO_IA §5). Key:
// (subtitle_line_id, kind, explanation_language, prompt_version).
// The model is NOT part of the key — explanations are reused across providers.

import { and, eq, sql } from "drizzle-orm";
import { aiExplanations, type Database, type DbOrTx, type Explanation } from "@fuchine/db";
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
  db: DbOrTx,
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
  db: DbOrTx,
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
 *
 * Single-flight: a cache miss is serialized on a per-key advisory lock so two
 * concurrent misses for the same line (the normal post-import case — the worker
 * pre-warm and the player prefetch walk the same region) don't both call the
 * provider and both pay for the same explanation. The second caller blocks,
 * wakes to a warm cache, and returns the hit — one provider call per key.
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

  // Fast path: a lock-free read serves the overwhelming common case (warm cache)
  // without a transaction. force skips it — it must regenerate.
  if (!opts.force) {
    const cached = await getCachedExplanation(db, key);
    if (cached) return cached;
  }

  // Miss (or force): take the per-key lock, then re-check the cache under it —
  // a concurrent miss that generated while we waited is now a hit.
  return db.transaction(async (tx) => {
    await acquireKeyLock(tx, key);
    if (!opts.force) {
      const cached = await getCachedExplanation(tx, key);
      if (cached) return cached;
    }
    // The lock (and this pooled connection) is held for the whole generation, so
    // cap it: a hung/slow provider must not pin a connection — and block every
    // same-key caller — indefinitely. On timeout the tx rolls back, releasing
    // the lock + connection; the next caller re-acquires and retries.
    const fresh = await withTimeout(
      callWithRetry(() =>
        provider.explainLine(ctx, { explanationLanguage: opts.explanationLanguage }),
      ),
      GENERATION_TIMEOUT_MS,
    );
    await saveExplanation(tx, key, fresh, opts.model ?? null);
    return fresh;
  });
}

// Upper bound on a single line's generation while it holds the advisory lock +
// connection. Generous — one line's explanation is a small generation; this only
// trips on a pathological hang (a dead socket with no RST).
const GENERATION_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("explanation generation timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Transaction-scoped advisory lock keyed on the cache key. Auto-released at
 * commit/rollback, so it spans exactly the generate-and-save window. hashtext
 * folds the composite key into the int4 that pg_advisory_xact_lock takes.
 */
async function acquireKeyLock(tx: DbOrTx, key: CacheKey): Promise<void> {
  const lockKey = `explain:${key.subtitleLineId}:${key.kind}:${key.explanationLanguage}:${key.promptVersion}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn(); // no artificial timeout — network errors surface via retry
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
