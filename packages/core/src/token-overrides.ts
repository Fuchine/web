// Per-user token corrections (T3.7). Pure and client-safe: the server applies
// them to the payloads it serves, the UI's "Fix" editor builds them. The
// apply/validate core lives in @fuchine/db/token-overrides (shared with the
// worker's calibration job) and is re-exported here.

import type { Token } from "@fuchine/db";
import { TokenOverrideError, type TokenOverride, type TokenSpan } from "@fuchine/db/token-overrides";

export {
  applyTokenOverrides,
  applyTokenOverridesDetailed,
  identitySpans,
  TokenOverrideError,
  validateTokenOverride,
  type AppliedTokenOverrides,
  type TokenOverride,
  type TokenSpan,
} from "@fuchine/db/token-overrides";

/* ------------------------------------------------------------------ */
/* Editor helpers (the "Fix" popup)                                    */
/* ------------------------------------------------------------------ */

/** Katakana → hiragana (readings are stored in hiragana). */
export function toHiragana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** A reading the editor accepts: hiragana (and the long-vowel mark), non-empty. */
export function isHiraganaReading(reading: string): boolean {
  return /^[ぁ-ゖゝゞー]+$/.test(reading);
}

/** Whether a surface is kana only (so its reading is the surface itself). */
export function isKanaOnly(surface: string): boolean {
  return /^[ぁ-ゖァ-ヶゝゞヽヾー]+$/.test(surface);
}

/**
 * Merge two adjacent tokens into one (マー + ク → マーク). The reading is the
 * concatenation (an empty side contributes nothing); lemma = the surface (a
 * merged word is its own dictionary form until the user picks an entry); the
 * entry is cleared so the server re-resolves it.
 */
export function mergeTokens(a: Token, b: Token): Token {
  const surface = a.surface + b.surface;
  const reading = (a.reading ?? "") + (b.reading ?? "");
  return {
    surface,
    lemma: surface,
    reading: reading || null,
    romaji: null,
    pos: a.pos,
    wordEntryId: null,
  };
}

/**
 * Split a token at character `at` (1..length-1). A kana-only half reads as
 * itself; a half with kanji gets no reading (the user types it). Both halves
 * lose the entry so the server re-resolves them by lemma.
 */
export function splitToken(t: Token, at: number): [Token, Token] {
  const chars = [...t.surface];
  if (!Number.isInteger(at) || at < 1 || at >= chars.length) {
    throw new TokenOverrideError("split position must fall inside the token");
  }
  const half = (surface: string): Token => ({
    surface,
    lemma: surface,
    reading: isKanaOnly(surface) ? toHiragana(surface) : null,
    romaji: null,
    pos: t.pos,
    wordEntryId: null,
  });
  return [half(chars.slice(0, at).join("")), half(chars.slice(at).join(""))];
}

/**
 * The range of corrected-token indices [lo, hi] an edit of corrected tokens
 * [a, b] must cover: an existing correction is replaced whole, so the range
 * grows to the edges of every block it touches.
 */
export function editBlock(spans: readonly TokenSpan[], a: number, b: number): [number, number] {
  let lo = a;
  let hi = b;
  while (lo > 0 && spans[lo - 1]!.end >= spans[a]!.start) lo--;
  while (hi < spans.length - 1 && spans[hi + 1]!.start <= spans[b]!.end) hi++;
  return [lo, hi];
}

/**
 * Turn an edit — corrected tokens [a, b] replaced by `draft` — into the
 * override to save, in original indices. Untouched neighbors inside the same
 * correction block are carried over, so the saved override always replaces
 * whole blocks and never overlaps another one.
 */
export function buildOverrideEdit<T extends { surface: string } = Token>(
  tokens: readonly T[],
  spans: readonly TokenSpan[],
  a: number,
  b: number,
  draft: readonly T[],
): { startIdx: number; endIdx: number; tokens: T[] } {
  if (a < 0 || b < a || b >= tokens.length || spans.length !== tokens.length) {
    throw new TokenOverrideError("edit range is outside the line");
  }
  const [lo, hi] = editBlock(spans, a, b);
  return {
    startIdx: spans[lo]!.start,
    endIdx: spans[hi]!.end,
    tokens: [...tokens.slice(lo, a), ...draft, ...tokens.slice(b + 1, hi + 1)],
  };
}

const sameToken = (x: Token, y: Token) =>
  x.surface === y.surface && x.lemma === y.lemma && (x.reading ?? "") === (y.reading ?? "")
  && x.pos === y.pos && (x.wordEntryId ?? null) === (y.wordEntryId ?? null);

/** Whether an override just restates the original tokens (saving it = reset). */
export function isNoopOverride(original: readonly Token[], o: TokenOverride): boolean {
  const span = original.slice(o.startIdx, o.endIdx + 1);
  return span.length === o.tokens.length && span.every((t, i) => sameToken(t, o.tokens[i]!));
}
