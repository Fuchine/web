// Layer-1 lazy translation: translate one 30-line chunk on demand, cache-first.
// Unlike the old import path, this runs from the web app using the house LLM
// key and records a chunk marker so already-done chunks cost zero tokens.

import { and, asc, eq, gte, lte } from "drizzle-orm";
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
  body: { lines?: ChunkLine[]; cached?: boolean; error?: string };
};


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
 * Translate (or serve cached) one chunk. Cache hit = chunk marker exists →
 * return stored translations, zero tokens. Miss → translateBatch, persist,
 * mark. Provider failure → 502, no marker (so it can retry later).
 */
export async function translateChunk(
  db: Database,
  videoId: string,
  chunkIdx: number,
  deps: { provider?: LlmProvider } = {},
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

  // Cache hit: marker present → serve stored translations.
  const [marker] = await db
    .select({ chunkIdx: subtitleTranslationChunks.chunkIdx })
    .from(subtitleTranslationChunks)
    .where(
      and(
        eq(subtitleTranslationChunks.videoId, videoId),
        eq(subtitleTranslationChunks.chunkIdx, chunkIdx),
      ),
    )
    .limit(1);
  if (marker) {
    return {
      status: 200,
      body: {
        lines: lines.map((l) => ({ id: l.id, textTranslation: l.textTranslation })),
        cached: true,
      },
    };
  }

  // Miss → translate.
  const provider = deps.provider ?? houseMtProvider();
  const translations = await provider.translateBatch(
    lines.map((l) => l.textOriginal),
    { from: video.language, to: "en" },
  );
  if (isTranslationFailure(lines, translations)) {
    return { status: 502, body: { error: "could not translate this section right now" } };
  }

  await Promise.all(
    lines.map((l, i) =>
      db
        .update(subtitleLines)
        .set({ textTranslation: translations[i] ?? null })
        .where(eq(subtitleLines.id, l.id)),
    ),
  );
  await db
    .insert(subtitleTranslationChunks)
    .values({ videoId, chunkIdx, status: "done" })
    .onConflictDoNothing();

  return {
    status: 200,
    body: {
      lines: lines.map((l, i) => ({ id: l.id, textTranslation: translations[i] ?? null })),
      cached: false,
    },
  };
}
