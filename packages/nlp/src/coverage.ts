// Coverage tokens (T3.9): which tokens of a line count toward a video's
// lexical coverage — the denominator of "you know N% of the running words".
// Pure and per language (D4); the worker materializes per-video counts with it
// (video_word_counts) and the web app applies the same rule to a user's token
// corrections on read. Spec: docs/plans/2026-10-30-known-words-spec.md.

import type { Token } from "./interfaces";

/**
 * Japanese exclusions. A token is NOT a coverage token when:
 *  - it has no dictionary entry (wordEntryId null: names the dictionary lacks,
 *    tokenizer debris, SFX, a user's "not a dictionary word" correction) —
 *    knowledge is tracked per entry, so it could never become "known";
 *  - kuromoji POS is 記号 (symbol/punctuation), 感動詞 (interjection),
 *    フィラー (filler: えーと, あの) or その他;
 *  - kuromoji pos_detail_1 is 固有名詞 (proper noun) or 数 (numeral);
 *  - the surface is only digits / kanji numerals, only punctuation/space, or
 *    only Latin letters (ｗｗｗ, OK, YouTube — not Japanese vocabulary);
 *  - every JMdict POS tag of the resolved entry is int / n-pr / num.
 * Particles (助詞) and auxiliaries (助動詞) ARE counted: the 80/90/95/98%
 * thresholds (Durbahn et al. 2024; Komori et al. 2004 for Japanese) are
 * defined over running words including function words, and jpdb counts them
 * too. They reach "likely" within the first video watched, so a learner is not
 * penalized for never reviewing は.
 */
export const JA_EXCLUDED_POS: ReadonlySet<string> = new Set(["記号", "感動詞", "フィラー", "その他"]);
export const JA_EXCLUDED_POS_DETAIL: ReadonlySet<string> = new Set(["固有名詞", "数"]);
export const JA_EXCLUDED_ENTRY_POS: ReadonlySet<string> = new Set(["int", "n-pr", "num"]);

const NUMERAL_ONLY = /^[0-9０-９〇零一二三四五六七八九十百千万億兆.,．，]+$/u;
const PUNCT_ONLY = /^[\p{P}\p{S}\p{Z}\s〜～ー・]+$/u;
const LATIN_ONLY = /^[A-Za-zＡ-Ｚａ-ｚ'’\-]+$/u;

/** `entryPos` = word_entries.pos of the token's entry (comma-joined JMdict tags), when known. */
export function isCoverageToken(token: Token, language = "ja", entryPos?: string | null): boolean {
  if (!token.wordEntryId) return false;
  const surface = token.surface.trim();
  if (surface.length === 0) return false;
  if (language !== "ja") return !PUNCT_ONLY.test(surface);
  if (JA_EXCLUDED_POS.has(token.pos)) return false;
  if (token.posDetail && JA_EXCLUDED_POS_DETAIL.has(token.posDetail)) return false;
  if (NUMERAL_ONLY.test(surface) || PUNCT_ONLY.test(surface) || LATIN_ONLY.test(surface)) return false;
  if (entryPos) {
    const tags = entryPos.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length > 0 && tags.every((t) => JA_EXCLUDED_ENTRY_POS.has(t))) return false;
  }
  return true;
}

/**
 * Occurrences per dictionary word over the coverage tokens of the given lines
 * (repeats inside a line count — this is running-word frequency).
 */
export function countCoverageWords(
  tokenLists: readonly (readonly Token[])[],
  language = "ja",
  entryPos: ReadonlyMap<string, string | null> = new Map(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tokens of tokenLists) {
    for (const t of tokens) {
      if (!isCoverageToken(t, language, t.wordEntryId ? entryPos.get(t.wordEntryId) : null)) continue;
      counts.set(t.wordEntryId!, (counts.get(t.wordEntryId!) ?? 0) + 1);
    }
  }
  return counts;
}
