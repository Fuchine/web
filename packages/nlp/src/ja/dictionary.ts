import { and, eq, inArray, or, sql } from "drizzle-orm";
import { wordEntries, type Database } from "@fuchine/db";
import type { DictionaryProvider, WordEntry } from "../interfaces";

/** Cap per lemma, mirroring the single lookup's `.limit(20)`. */
const MAX_HITS_PER_LEMMA = 20;

/**
 * Group flat query rows under every queried key they match — by lemma OR by
 * reading, mirroring the single lookup's `lemma = X OR reading = X`. Rows are
 * expected pre-sorted by frequency; that order is preserved within each group.
 * Pure (no DB) so the pipeline's batch path is unit-testable without Postgres.
 */
export function groupHitsByLemma(rows: WordEntry[], keys: string[]): Map<string, WordEntry[]> {
  const wanted = new Set(keys);
  const out = new Map<string, WordEntry[]>();
  const push = (key: string, row: WordEntry) => {
    if (!wanted.has(key)) return;
    const group = out.get(key) ?? [];
    if (group.length < MAX_HITS_PER_LEMMA) group.push(row);
    out.set(key, group);
  };
  for (const row of rows) {
    push(row.lemma, row);
    if (row.reading != null && row.reading !== row.lemma) push(row.reading, row);
  }
  return out;
}

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

  /**
   * Batch lookup: resolve every distinct lemma of a video in one query
   * (`lemma IN (...) OR reading IN (...)`), then group in memory. Selects the
   * full row like `lookup` so callers see identical hit shapes.
   */
  async lookupMany(lemmas: string[]): Promise<Map<string, WordEntry[]>> {
    const unique = [...new Set(lemmas)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(wordEntries)
      .where(
        and(
          eq(wordEntries.language, this.language),
          or(inArray(wordEntries.lemma, unique), inArray(wordEntries.reading, unique)),
        ),
      )
      .orderBy(sql`${wordEntries.frequencyRank} asc nulls last`);
    return groupHitsByLemma(rows, unique);
  }
}
