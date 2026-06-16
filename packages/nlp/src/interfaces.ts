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
}
