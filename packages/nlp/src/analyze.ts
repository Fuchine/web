// Layer 0, end to end: tokenize a line and resolve each token to a dictionary
// entry. Kept separate from the Tokenizer so tokenization stays DB-free.

import type { Database } from "@fuchine/db";
import type { DictionaryProvider, Token } from "./interfaces";
import { getDictionary, getTokenizer } from "./registry";

/**
 * Fill `wordEntryId` on tokens by looking each lemma up in the dictionary.
 * Prefers an entry whose reading matches the token's reading; otherwise takes
 * the most frequent hit. Leaves null when nothing matches.
 */
export async function resolveWordEntries(
  tokens: Token[],
  dictionary: DictionaryProvider,
): Promise<Token[]> {
  // Cache lookups within a line — the same word often repeats.
  const cache = new Map<string, string | null>();

  return Promise.all(
    tokens.map(async (token) => {
      if (token.lemma.length === 0) return token;

      let resolved = cache.get(token.lemma);
      if (resolved === undefined) {
        const hits = await dictionary.lookup(token.lemma);
        const exact = hits.find((h) => h.reading === token.reading);
        resolved = (exact ?? hits[0])?.id ?? null;
        cache.set(token.lemma, resolved);
      }

      return resolved ? { ...token, wordEntryId: resolved } : token;
    }),
  );
}

/** Tokenize a line and resolve dictionary entries in one call. */
export async function analyzeLine(
  text: string,
  language: string,
  db: Database,
): Promise<Token[]> {
  const tokens = await getTokenizer(language).tokenize(text);
  return resolveWordEntries(tokens, getDictionary(language, db));
}
