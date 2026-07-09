// Layer 0, end to end: tokenize a line and resolve each token to a dictionary
// entry. Kept separate from the Tokenizer so tokenization stays DB-free.

import type { Database } from "@fuchine/db";
import type { DictionaryProvider, Token } from "./interfaces";
import { getDictionary, getTokenizer } from "./registry";

/**
 * Fill `wordEntryId` on tokens by looking each lemma up in the dictionary.
 * Prefers an entry whose reading matches the token's reading; otherwise takes
 * the most frequent hit. Leaves null when nothing matches.
 *
 * Pass a `cache` shared across calls (e.g. one per import) to collapse the
 * N+1: a common lemma repeated across a video's lines is looked up once, not
 * once per occurrence (backlog: import-pipeline-batching). Defaults to a fresh
 * per-call cache, so standalone callers keep the previous per-line behavior.
 */
export async function resolveWordEntries(
  tokens: Token[],
  dictionary: DictionaryProvider,
  cache: Map<string, string | null> = new Map(),
): Promise<Token[]> {
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

/**
 * Tokenize a line and resolve dictionary entries in one call. Pass a `cache`
 * shared across the video's lines to reuse dictionary lookups (see
 * resolveWordEntries).
 */
export async function analyzeLine(
  text: string,
  language: string,
  db: Database,
  cache?: Map<string, string | null>,
): Promise<Token[]> {
  const tokens = await getTokenizer(language).tokenize(text);
  return resolveWordEntries(tokens, getDictionary(language, db), cache);
}
