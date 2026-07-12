// Layer 0, end to end: tokenize a line and resolve each token to a dictionary
// entry. Kept separate from the Tokenizer so tokenization stays DB-free.

import type { Database } from "@fuchine/db";
import type { DictionaryProvider, Token, WordEntry } from "./interfaces";
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

/**
 * Resolve prefetched dictionary hits onto a line's tokens. Prefers an entry
 * whose reading matches the token's; otherwise takes the most frequent hit.
 * Pure — the DB round trip already happened in `lookupLemmas`.
 */
export function resolveTokensFromHits(
  tokens: Token[],
  hits: Map<string, WordEntry[]>,
): Token[] {
  return tokens.map((token) => {
    if (token.lemma.length === 0) return token;
    const candidates = hits.get(token.lemma) ?? [];
    const exact = candidates.find((h) => h.reading === token.reading);
    const id = (exact ?? candidates[0])?.id ?? null;
    return id ? { ...token, wordEntryId: id } : token;
  });
}

/**
 * Resolve many lemmas in one round trip, grouped by lemma. Uses the provider's
 * optional `lookupMany` when available (1 query for the whole video), otherwise
 * falls back to per-lemma `lookup`. Empty and duplicate lemmas are dropped.
 */
export async function lookupLemmas(
  lemmas: string[],
  dictionary: DictionaryProvider,
): Promise<Map<string, WordEntry[]>> {
  const unique = [...new Set(lemmas.filter((l) => l.length > 0))];
  if (unique.length === 0) return new Map();
  if (dictionary.lookupMany) return dictionary.lookupMany(unique);
  const entries = await Promise.all(
    unique.map(async (lemma) => [lemma, await dictionary.lookup(lemma)] as const),
  );
  return new Map(entries);
}

/**
 * Batch layer 0 for a whole video: tokenize every line, resolve all distinct
 * lemmas in a single dictionary round trip, then fill `wordEntryId` per token.
 * Replaces the per-line `analyzeLine` loop in the import pipeline (backlog:
 * import-pipeline-batching). Returns tokens per input line, in order.
 */
export async function analyzeLines(
  texts: string[],
  language: string,
  db: Database,
): Promise<Token[][]> {
  const tokenizer = getTokenizer(language);
  const tokenized = await Promise.all(texts.map((t) => tokenizer.tokenize(t)));
  const hits = await lookupLemmas(
    tokenized.flatMap((tokens) => tokens.map((t) => t.lemma)),
    getDictionary(language, db),
  );
  return tokenized.map((tokens) => resolveTokensFromHits(tokens, hits));
}
