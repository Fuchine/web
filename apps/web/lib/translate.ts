// Layer-1 lazy translation: translate one 30-line chunk on demand, cache-first.
// Unlike the old import path, this runs from the web app using the house LLM
// key and records a chunk marker so already-done chunks cost zero tokens.

import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  type Database,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
} from "@fuchine/db";
import { type LlmProvider } from "@fuchine/llm";
import { houseMtProvider } from "./house-provider";
import { lineRangeForChunk } from "@fuchine/core";

export type ChunkLine = { id: string; textTranslation: string | null };
export type Result = {
  status: number;
  body: { lines?: ChunkLine[]; cached?: boolean; pending?: boolean; error?: string; retryAfterSeconds?: number };
};

// How long the client should wait before re-fetching a chunk another request is
// already translating (returned as retryAfterSeconds on a 202).
const PENDING_RETRY_SECONDS = 2;

// How old a 'pending' claim must be before the sweep treats it as orphaned (a
// process that crashed mid-translate). Sized comfortably above the worst-case
// time to translate one 30-line chunk (incl. fallback line-by-line) so a
// legitimately slow-but-live translation is never swept out from under itself
// and re-claimed — that would double-pay the MT call. The cost of the larger
// window is only a slower recovery for a genuinely crashed claim (the chunk
// stays JP-only, retryable, until then — no money at stake).
const STALE_CLAIM_SECONDS = 300;

/** Release a 'pending' claim on this chunk so it can be retried (on failure). */
async function releaseClaim(db: Database, videoId: string, chunkIdx: number): Promise<void> {
  await db
    .delete(subtitleTranslationChunks)
    .where(
      and(
        eq(subtitleTranslationChunks.videoId, videoId),
        eq(subtitleTranslationChunks.chunkIdx, chunkIdx),
        eq(subtitleTranslationChunks.status, "pending"),
      ),
    );
}


/**
 * True when the provider almost certainly failed: every line came back null
 * even though the chunk has real (non-SFX, non-blank) dialogue. A legitimately
 * all-SFX chunk is NOT a failure. (Pure — unit-tested.)
 */
export function isTranslationFailure(
  lines: { textOriginal: string }[],
  translations: (string | null)[],
): boolean {
  // Misaligned result (should never happen per CONTRATO §3.2) → treat as failure
  // so we never persist a partial/wrong translation; the caller can retry.
  if (translations.length !== lines.length) return true;

  const allNull = translations.every((t) => t == null);
  const hasRealText = lines.some(
    (l) => l.textOriginal.trim().length > 0 && !l.textOriginal.trimStart().startsWith("♪"),
  );
  return allNull && hasRealText;
}

/**
 * Translate (or serve cached) one chunk. Cache hit = a 'done' chunk marker →
 * return stored translations, zero tokens. Miss → claim the chunk with a
 * 'pending' marker (so two concurrent requests never both pay for the same
 * chunk), translateBatch, then batch-persist + flip to 'done' in one tx. A
 * request that loses the claim gets 202 (retry onto the cache). Provider
 * failure releases the claim and returns 502 (retryable).
 */
export async function translateChunk(
  db: Database,
  videoId: string,
  chunkIdx: number,
  deps: {
    provider?: LlmProvider;
    /** Called only on a cache miss (about to spend tokens); return a non-ok verdict to deny. */
    checkRateLimit?: () => Promise<{ ok: boolean; retryAfterSeconds: number }>;
  } = {},
): Promise<Result> {
  const [video] = await db
    .select({ id: videos.id, language: videos.language })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video) return { status: 404, body: { error: "video not found" } };

  const { startIdx, endIdx } = lineRangeForChunk(chunkIdx);
  const lines = await db
    .select({
      id: subtitleLines.id,
      textOriginal: subtitleLines.textOriginal,
      textTranslation: subtitleLines.textTranslation,
    })
    .from(subtitleLines)
    .where(
      and(
        eq(subtitleLines.videoId, videoId),
        gte(subtitleLines.idx, startIdx),
        lte(subtitleLines.idx, endIdx),
      ),
    )
    .orderBy(asc(subtitleLines.idx));
  if (lines.length === 0) return { status: 200, body: { lines: [], cached: true } };

  // A translate that crashed mid-flight could leave a 'pending' claim wedging
  // this chunk forever. Clear a pending claim only if it's older than the sweep
  // window; a fresh one (someone actively translating) is left alone.
  await db
    .delete(subtitleTranslationChunks)
    .where(
      and(
        eq(subtitleTranslationChunks.videoId, videoId),
        eq(subtitleTranslationChunks.chunkIdx, chunkIdx),
        eq(subtitleTranslationChunks.status, "pending"),
        lt(subtitleTranslationChunks.createdAt, sql`now() - make_interval(secs => ${STALE_CLAIM_SECONDS})`),
      ),
    );

  // Marker present: 'done' → serve stored translations (zero tokens); 'pending'
  // → another request is translating right now, tell the client to retry soon.
  const [marker] = await db
    .select({ status: subtitleTranslationChunks.status })
    .from(subtitleTranslationChunks)
    .where(
      and(
        eq(subtitleTranslationChunks.videoId, videoId),
        eq(subtitleTranslationChunks.chunkIdx, chunkIdx),
      ),
    )
    .limit(1);
  if (marker?.status === "done") {
    return {
      status: 200,
      body: {
        lines: lines.map((l) => ({ id: l.id, textTranslation: l.textTranslation })),
        cached: true,
      },
    };
  }
  if (marker?.status === "pending") {
    return { status: 202, body: { pending: true, retryAfterSeconds: PENDING_RETRY_SECONDS } };
  }

  // Miss → about to spend tokens. Rate-limit here so cached chunks stay free.
  if (deps.checkRateLimit) {
    const rl = await deps.checkRateLimit();
    if (!rl.ok) {
      return {
        status: 429,
        body: {
          error: "Too many translations today — try again later.",
          retryAfterSeconds: rl.retryAfterSeconds,
        },
      };
    }
  }

  // Claim the chunk: insert a 'pending' marker as a lock. Concurrent requests
  // for the same chunk race on the (video, chunk) primary key — exactly one
  // INSERT returns a row and pays for the translation; the losers get 202 and
  // retry onto the cache instead of duplicating the (paid) MT call.
  const claim = await db
    .insert(subtitleTranslationChunks)
    .values({ videoId, chunkIdx, status: "pending" })
    .onConflictDoNothing()
    .returning({ chunkIdx: subtitleTranslationChunks.chunkIdx });
  if (claim.length === 0) {
    // Lost the race between the marker read and the claim — hand the client a
    // retry; its next fetch reads fresh lines + the winner's 'done' marker.
    return { status: 202, body: { pending: true, retryAfterSeconds: PENDING_RETRY_SECONDS } };
  }

  // We hold the claim → translate. Any failure releases the claim so the chunk
  // stays retryable (never a wedged 'pending').
  const provider = deps.provider ?? houseMtProvider();
  let translations: (string | null)[];
  try {
    translations = await provider.translateBatch(
      lines.map((l) => l.textOriginal),
      // Shared-cache MT (D3): attribute cost to the video, not a single viewer.
      { from: video.language, to: "en", meta: { videoId } },
    );
  } catch (err) {
    await releaseClaim(db, videoId, chunkIdx);
    throw err;
  }
  if (isTranslationFailure(lines, translations)) {
    await releaseClaim(db, videoId, chunkIdx);
    return { status: 502, body: { error: "could not translate this section right now" } };
  }

  // Persist in one round trip: a single batched UPDATE (unnest the id/text pairs
  // as a VALUES join) plus flipping the claim to 'done', in one transaction — the
  // chunk is either fully translated and marked, or neither.
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE ${subtitleLines} AS s
        SET text_translation = v.tr
        FROM (VALUES ${sql.join(
          lines.map((l, i) => sql`(${l.id}::uuid, ${translations[i] ?? null}::text)`),
          sql`, `,
        )}) AS v(id, tr)
        WHERE s.id = v.id
      `);
      await tx
        .update(subtitleTranslationChunks)
        .set({ status: "done" })
        .where(
          and(
            eq(subtitleTranslationChunks.videoId, videoId),
            eq(subtitleTranslationChunks.chunkIdx, chunkIdx),
          ),
        );
    });
  } catch (err) {
    // The claim was committed before we translated; a persist failure must
    // release it — like the provider/failure paths above — so the chunk isn't
    // wedged 'pending' (every request 202) until the stale sweep.
    await releaseClaim(db, videoId, chunkIdx);
    throw err;
  }

  return {
    status: 200,
    body: {
      lines: lines.map((l, i) => ({ id: l.id, textTranslation: translations[i] ?? null })),
      cached: false,
    },
  };
}
