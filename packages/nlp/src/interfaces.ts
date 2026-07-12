// Layer 0 (local, free) interfaces. One adapter per language (D4).
// Token / WordEntry shapes are owned by @fuchine/db so the schema stays the
// single source of truth for what gets persisted.

import type { Token, WordEntry } from "@fuchine/db";

export type { Token, WordEntry };

export interface Tokenizer {
  readonly language: string;
  /** Segment a line into tokens (surface, lemma, reading, pos). */
  tokenize(text: string): Promise<Token[]>;
}

export interface DictionaryProvider {
  readonly language: string;
  /** Resolve dictionary entries for a base form (lemma). */
  lookup(lemma: string): Promise<WordEntry[]>;
  /**
   * Optional batch form: resolve many lemmas in a single round trip, returning
   * hits grouped by the queried lemma. Callers must fall back to `lookup` when
   * absent (see `lookupLemmas`). Additive to keep D4 intact for adapters that
   * don't implement it.
   */
  lookupMany?(lemmas: string[]): Promise<Map<string, WordEntry[]>>;
}
