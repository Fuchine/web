// Layer-2 line explanation (F1, T1.5). Cache-first: a cached explanation is
// served without needing the user's key (the cache is shared). Only a cache
// miss resolves the user's BYOK provider and generates.

import { and, eq, inArray } from "drizzle-orm";
import { type Database, subtitleLines, videos } from "@fuchine/db";
import {
  getCachedExplanation,
  explainLineCached,
  resolveUserProvider,
  PROMPT_VERSION,
  MissingApiKeyError,
  ProviderError,
  type SubtitleLineCtx,
} from "@fuchine/llm";

export type Result = { status: number; body: Record<string, unknown> };

export async function explainLine(
  db: Database,
  userId: string,
  lineId: string,
  opts: { encryptionKey?: string },
): Promise<Result> {
  const [line] = await db
    .select()
    .from(subtitleLines)
    .where(eq(subtitleLines.id, lineId))
    .limit(1);
  if (!line) return { status: 404, body: { error: "subtitle line not found" } };

  const settings = await db.query.userSettings.findFirst({
    where: (s, { eq: e }) => e(s.userId, userId),
  });
  const explanationLanguage = settings?.explanationLanguage || "en";

  // Cache-first — no key required on a hit (shared cache, CONTRATO §5).
  const key = {
    subtitleLineId: lineId,
    kind: "line" as const,
    explanationLanguage,
    promptVersion: PROMPT_VERSION,
  };
  const cached = await getCachedExplanation(db, key);
  if (cached) return { status: 200, body: { explanation: cached, cached: true } };

  // Miss → need the user's provider.
  if (!opts.encryptionKey) {
    return { status: 500, body: { error: "server encryption key not configured" } };
  }
  let provider;
  try {
    provider = await resolveUserProvider(db, userId, opts.encryptionKey);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return { status: 422, body: { error: err.message, needsKey: true } };
    }
    throw err;
  }

  // Build the context: the line plus its neighbors and tokens (CONTRATO §4.1).
  const neighbors = await db
    .select({ idx: subtitleLines.idx, textOriginal: subtitleLines.textOriginal })
    .from(subtitleLines)
    .where(and(
      eq(subtitleLines.videoId, line.videoId),
      inArray(subtitleLines.idx, [line.idx - 1, line.idx + 1]),
    ));
  const [video] = await db
    .select({ language: videos.language })
    .from(videos)
    .where(eq(videos.id, line.videoId))
    .limit(1);

  const ctx: SubtitleLineCtx = {
    text: line.textOriginal,
    prevText: neighbors.find((n) => n.idx === line.idx - 1)?.textOriginal ?? null,
    nextText: neighbors.find((n) => n.idx === line.idx + 1)?.textOriginal ?? null,
    tokens: line.tokens,
    learningLanguage: video?.language ?? "ja",
  };

  try {
    const explanation = await explainLineCached(db, provider, lineId, ctx, { explanationLanguage });
    return { status: 200, body: { explanation, cached: false } };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { status: 502, body: { error: "could not generate an explanation right now" } };
    }
    throw err;
  }
}
