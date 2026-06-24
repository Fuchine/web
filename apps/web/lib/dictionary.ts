// Dictionary lookups (F1 popup + F2 search). Auth-agnostic and testable.

import { asc, eq } from "drizzle-orm";
import { type Database, wordEntries, wordExamples, subtitleLines, videos } from "@fuchine/db";
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
