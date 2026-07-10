// Phrases read-side query (mined sentence cards). Auth-agnostic; routes add auth.

import { and, desc, eq, lt, or } from "drizzle-orm";
import { type Database, sentenceCards, subtitleLines, videos } from "@fuchine/db";

export type PhraseRow = {
  cardId: string;
  state: number;       // FSRS: 0 New · 1 Learning · 2 Review · 3 Relearning
  due: Date;
  createdAt: Date;
  textOriginal: string;
  textTranslation: string | null;
  tStartMs: number;
  videoId: string;
  videoTitle: string;
  sourceId: string;
  source: string;
};

/** Mined phrases for a user, newest first (paginated). */
export async function listPhrases(
  db: Database,
  userId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ items: PhraseRow[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 50;
  const pageConditions = [eq(sentenceCards.userId, userId)];
  if (opts.cursor) {
    const parts = opts.cursor.split(":");
    const ts = parseInt(parts[1] ?? "", 10);
    const id = parts.slice(2).join(":");
    if (!isNaN(ts) && id) {
      pageConditions.push(
        or(
          lt(sentenceCards.createdAt, new Date(ts)),
          and(eq(sentenceCards.createdAt, new Date(ts)), lt(sentenceCards.id, id)),
        )!,
      );
    }
  }

  const rows = await db
    .select({
      cardId: sentenceCards.id,
      state: sentenceCards.state,
      due: sentenceCards.due,
      createdAt: sentenceCards.createdAt,
      textOriginal: subtitleLines.textOriginal,
      textTranslation: subtitleLines.textTranslation,
      tStartMs: subtitleLines.tStartMs,
      videoId: videos.id,
      videoTitle: videos.title,
      sourceId: videos.sourceId,
      source: videos.source,
    })
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(and(...pageConditions))
    .orderBy(desc(sentenceCards.createdAt), desc(sentenceCards.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit) as PhraseRow[];
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? `t:${last.createdAt.getTime()}:${last.cardId}`
    : null;

  return { items, nextCursor };
}
