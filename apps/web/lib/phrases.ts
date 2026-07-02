// Phrases read-side query (mined sentence cards). Auth-agnostic; routes add auth.

import { desc, eq } from "drizzle-orm";
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

/** All mined phrases for a user, newest first. */
export async function listPhrases(db: Database, userId: string): Promise<PhraseRow[]> {
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
    .where(eq(sentenceCards.userId, userId))
    .orderBy(desc(sentenceCards.createdAt));

  return rows;
}
