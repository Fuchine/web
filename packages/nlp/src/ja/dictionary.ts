import { and, eq, or, sql } from "drizzle-orm";
import { wordEntries, type Database } from "@fuchine/db";
import type { DictionaryProvider, WordEntry } from "../interfaces";

/**
 * Japanese dictionary provider (layer 0), backed by JMdict seeded into
 * `word_entries`. Matches on the base form (lemma) or its reading, most
 * frequent first. Returns [] when nothing matches — callers tolerate that.
 */
export class JaDictionary implements DictionaryProvider {
  readonly language = "ja";

  constructor(private readonly db: Database) {}

  async lookup(lemma: string): Promise<WordEntry[]> {
    return this.db
      .select()
      .from(wordEntries)
      .where(
        and(
          eq(wordEntries.language, this.language),
          or(eq(wordEntries.lemma, lemma), eq(wordEntries.reading, lemma)),
        ),
      )
      .orderBy(sql`${wordEntries.frequencyRank} asc nulls last`)
      .limit(20);
  }
}
