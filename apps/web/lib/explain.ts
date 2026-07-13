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
  type LlmProvider,
  type SubtitleLineCtx,
} from "@fuchine/llm";
import { houseProvider } from "./house-provider";
import { enforceRateLimit, tooManyRequests } from "./rate-limit";

export type Result = { status: number; body: Record<string, unknown> };

export async function explainLine(
  db: Database,
  userId: string,
  lineId: string,
  opts: {
    encryptionKey?: string;
    force?: boolean;
    /** Test seam: bypass BYOK/house resolution and use this provider directly. */
    provider?: LlmProvider;
  },
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
  // Rate limit only the paths that spend tokens on the house key. A cache hit
  // costs nothing and is never limited; force overwrites the shared cache (cache
  // poisoning risk) so it has its own tighter budget.
  if (opts.force) {
    const rl = await enforceRateLimit("explainForce", userId);
    if (!rl.ok) return tooManyRequests(rl, "Too many regenerations today — try again later.");
  } else {
    const cached = await getCachedExplanation(db, key);
    if (cached) return { status: 200, body: { explanation: cached, cached: true } };
    const rl = await enforceRateLimit("explainMiss", userId);
    if (!rl.ok) return tooManyRequests(rl, "Too many explanation requests right now — try again shortly.");
  }

  // Miss → need a provider. An injected provider (tests) wins; otherwise BYOK
  // when configured, else fall back to the house key. Any failure in resolving
  // the user's provider (missing key, unimplemented provider, undecryptable
  // ciphertext from a rotated encryption key) degrades to the house key —
  // never a 500 (ARQUITETURA: "falha de IA degrada, não quebra").
  let provider: LlmProvider;
  if (opts.provider) {
    provider = opts.provider;
  } else {
    try {
      provider = await resolveUserProvider(db, userId, opts.encryptionKey ?? "");
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        provider = houseProvider();
      } else {
        // Provider construction or key decryption failed (e.g. rotated
        // FUCHINE_ENCRYPTION_KEY, unimplemented provider saved before the
        // allow-list was narrowed). Degrade to house key and log for diagnosis.
        // Never log the key or ciphertext — only the error type and userId.
        console.warn(
          `[explain] BYOK provider resolution failed for user ${userId}: ` +
            `${err instanceof Error ? err.constructor.name : typeof err} ` +
            `(degrading to house provider)`,
        );
        provider = houseProvider();
      }
    }
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
    const explanation = await explainLineCached(db, provider, lineId, ctx, {
      explanationLanguage,
      force: opts.force,
      meta: { userId, videoId: line.videoId },
    });
    return { status: 200, body: { explanation, cached: false } };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { status: 502, body: { error: "could not generate an explanation right now" } };
    }
    throw err;
  }
}
