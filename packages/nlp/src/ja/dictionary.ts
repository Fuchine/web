import type { DictionaryProvider, WordEntry } from "../interfaces";

/**
 * Japanese dictionary provider (layer 0), backed by JMdict (jmdict-simplified)
 * seeded into `word_entries`. F0 placeholder returns no matches until the seed
 * and the lookup query land; callers must already tolerate empty results.
 */
export class JaDictionary implements DictionaryProvider {
  readonly language = "ja";

  // eslint-disable-next-line @typescript-eslint/require-await
  async lookup(_lemma: string): Promise<WordEntry[]> {
    // TODO(nlp): query word_entries by (language, lemma) / (language, reading).
    return [];
  }
}
