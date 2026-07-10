// Dictionary lookups (F1 popup + F2 search). Auth-agnostic and testable.

import { and, asc, eq, sql } from "drizzle-orm";
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
 * 0–5 tier for the UI dots. Re-exported from @fuchine/core so the player
 * popup and the dictionary screen share the same implementation.
 */
export { freqTier } from "@fuchine/core";

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

export type WordStatus = "known" | "learning" | "new";

/**
 * Set (or clear, with null) the manual status override for a word. Setting a
 * status implies saving the word, so this upserts the saved_words row.
 */
export async function setWordStatus(
  db: Database,
  userId: string,
  wordEntryId: string,
  status: WordStatus | null,
): Promise<void> {
  await db
    .insert(savedWords)
    .values({ userId, wordEntryId, status })
    .onConflictDoUpdate({
      target: [savedWords.userId, savedWords.wordEntryId],
      set: { status },
    });
}

/** The user's manual status overrides, keyed by word_entry id (nulls omitted). */
export async function getSavedStatuses(
  db: Database,
  userId: string,
): Promise<Record<string, WordStatus>> {
  const rows = await db
    .select({ wordEntryId: savedWords.wordEntryId, status: savedWords.status })
    .from(savedWords)
    .where(eq(savedWords.userId, userId));
  const out: Record<string, WordStatus> = {};
  for (const r of rows) if (r.status) out[r.wordEntryId] = r.status;
  return out;
}

/** Pick the search mode for an Auto query: any Japanese char → "ja", else "en". */
export function detectMode(q: string): "ja" | "en" {
  return /[぀-ヿ㐀-鿿]/.test(q) ? "ja" : "en";
}

/** Search entries by English meaning — any gloss contains `term` (case-insensitive). */
export async function searchByGloss(db: Database, term: string, language = "ja") {
  // ILIKE '%term%' over the materialized `glosses_text` rides the pg_trgm GIN
  // index (word_entries_glosses_trgm_idx) — same semantics as the old jsonb
  // unnest, but an index probe instead of a 298k-row seq scan per keystroke.
  return db
    .select()
    .from(wordEntries)
    .where(
      and(
        eq(wordEntries.language, language),
        sql`${wordEntries.glossesText} ILIKE ${"%" + term + "%"}`,
      ),
    )
    .orderBy(sql`${wordEntries.frequencyRank} asc nulls last`)
    .limit(20);
}
