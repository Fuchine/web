// Dictionary lookups (F1 popup + F2 search). Auth-agnostic and testable.

import { and, asc, eq } from "drizzle-orm";
import { type Database, wordEntries, wordExamples, subtitleLines, videos, savedWords } from "@fuchine/db";
import { getDictionary } from "@fuchine/nlp";

/** Fetch one entry by id — what the player popup uses for a resolved token. */
export async function lookupById(db: Database, id: string) {
  const [entry] = await db
    .select()
    .from(wordEntries)
    .where(eq(wordEntries.id, id))
    .limit(1);
  return entry ?? null;
}

/** Search by lemma or reading (most frequent first). */
export async function searchDictionary(db: Database, q: string, language = "ja") {
  return getDictionary(language, db).lookup(q);
}

/**
 * Map a JMdict frequency rank (lower = more frequent; null = unranked) to a
 * 0–5 tier for the UI dots. Pure.
 */
export function freqTier(rank: number | null): number {
  if (rank == null) return 0;
  if (rank <= 1500) return 5;
  if (rank <= 5000) return 4;
  if (rank <= 15000) return 3;
  if (rank <= 30000) return 2;
  return 1;
}

export type WordExample = {
  videoId: string;
  videoTitle: string | null;
  source: string;
  sourceId: string;
  lineId: string;
  text: string;
  translation: string | null;
  startMs: number;
};

/** Occurrences of a word across the user's videos ("From your videos"). */
export async function getWordExamples(
  db: Database,
  wordEntryId: string,
  limit = 10,
): Promise<WordExample[]> {
  return db
    .select({
      videoId: videos.id,
      videoTitle: videos.title,
      source: videos.source,
      sourceId: videos.sourceId,
      lineId: subtitleLines.id,
      text: subtitleLines.textOriginal,
      translation: subtitleLines.textTranslation,
      startMs: subtitleLines.tStartMs,
    })
    .from(wordExamples)
    .innerJoin(subtitleLines, eq(subtitleLines.id, wordExamples.subtitleLineId))
    .innerJoin(videos, eq(videos.id, wordExamples.videoId))
    .where(eq(wordExamples.wordEntryId, wordEntryId))
    .orderBy(asc(subtitleLines.tStartMs))
    .limit(limit);
}

/** The user's saved word_entry ids (for the bookmark UI). */
export async function getSavedWordIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ wordEntryId: savedWords.wordEntryId })
    .from(savedWords)
    .where(eq(savedWords.userId, userId));
  return rows.map((r) => r.wordEntryId);
}

/** Bookmark a word (idempotent). */
export async function saveWord(db: Database, userId: string, wordEntryId: string): Promise<void> {
  await db.insert(savedWords).values({ userId, wordEntryId }).onConflictDoNothing();
}

/** Remove a bookmark (no-op if absent). */
export async function unsaveWord(db: Database, userId: string, wordEntryId: string): Promise<void> {
  await db.delete(savedWords).where(and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, wordEntryId)));
}
