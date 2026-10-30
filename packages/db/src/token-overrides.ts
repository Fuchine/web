// Per-user token corrections (T3.7): the pure apply/validate core. Pure and
// client-safe (imports types only), so it is exported as the
// `@fuchine/db/token-overrides` subpath: @fuchine/core re-exports it for the
// UI, and the shared known-word calibration (./calibration) reads it without
// pulling @fuchine/core into the worker.
//
// An override replaces the original tokens [startIdx, endIdx] (inclusive) of a
// line with `tokens`. Merges (マー|ク → マーク) and splits (one token → two) are
// both span replacements. The one invariant: the corrected surfaces concatenate
// to exactly the original span's surfaces — the line text never changes.

import type { Token } from "./types";

export type TokenOverride = { startIdx: number; endIdx: number; tokens: Token[] };

/**
 * Where a corrected token came from: the original token indices [start, end]
 * (inclusive) of its block, and whether that block is a user correction. A
 * corrected block's tokens all share the same span; an untouched token's span
 * is [i, i].
 */
export type TokenSpan = { start: number; end: number; corrected: boolean };

export type AppliedTokenOverrides = {
  tokens: Token[];
  /** Parallel to `tokens`. */
  spans: TokenSpan[];
  /** Overrides that were invalid or overlapped an earlier one (lenient mode). */
  skipped: TokenOverride[];
};

export class TokenOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenOverrideError";
  }
}

const surfaces = (tokens: readonly Pick<Token, "surface">[]) => tokens.map((t) => t.surface).join("");

/**
 * Why `o` can't apply to `original`, or null when it can: integer span inside
 * the line, at least one token, non-empty surfaces, and the surfaces
 * concatenate to the original span's text.
 */
export function validateTokenOverride(original: readonly Token[], o: TokenOverride): string | null {
  if (!Number.isInteger(o.startIdx) || !Number.isInteger(o.endIdx)) return "span indices must be integers";
  if (o.startIdx < 0 || o.endIdx < o.startIdx) return "span must satisfy 0 <= startIdx <= endIdx";
  if (o.endIdx >= original.length) return "span is outside the line";
  if (!Array.isArray(o.tokens) || o.tokens.length === 0) return "tokens must be a non-empty array";
  if (o.tokens.some((t) => typeof t?.surface !== "string" || t.surface.length === 0)) {
    return "every token needs a non-empty surface";
  }
  const expected = surfaces(original.slice(o.startIdx, o.endIdx + 1));
  if (surfaces(o.tokens) !== expected) {
    return `surfaces must spell exactly "${expected}" (the line text cannot change)`;
  }
  return null;
}

/**
 * Apply overrides and report where each corrected token came from. Overrides
 * are sorted by start; each must be valid and must not overlap the previous
 * one. `strict` throws TokenOverrideError on the first bad override; lenient
 * (the read path) skips it, so a stale correction — e.g. the line was
 * re-tokenized after it was saved — degrades to the shared tokens instead of
 * breaking the line.
 */
export function applyTokenOverridesDetailed(
  original: readonly Token[],
  overrides: readonly TokenOverride[],
  opts: { strict?: boolean } = {},
): AppliedTokenOverrides {
  const sorted = [...overrides].sort((a, b) => a.startIdx - b.startIdx);
  const accepted: TokenOverride[] = [];
  const skipped: TokenOverride[] = [];
  for (const o of sorted) {
    let error = validateTokenOverride(original, o);
    const prev = accepted[accepted.length - 1];
    if (!error && prev && o.startIdx <= prev.endIdx) error = "corrections must not overlap";
    if (error) {
      if (opts.strict) throw new TokenOverrideError(error);
      skipped.push(o);
      continue;
    }
    accepted.push(o);
  }

  const tokens: Token[] = [];
  const spans: TokenSpan[] = [];
  let i = 0;
  for (const o of accepted) {
    for (; i < o.startIdx; i++) {
      tokens.push(original[i]!);
      spans.push({ start: i, end: i, corrected: false });
    }
    for (const t of o.tokens) {
      tokens.push(t);
      spans.push({ start: o.startIdx, end: o.endIdx, corrected: true });
    }
    i = o.endIdx + 1;
  }
  for (; i < original.length; i++) {
    tokens.push(original[i]!);
    spans.push({ start: i, end: i, corrected: false });
  }
  return { tokens, spans, skipped };
}

/**
 * The corrected tokens of a line. Strict: throws TokenOverrideError when an
 * override would change the line text, falls outside it, or overlaps another.
 */
export function applyTokenOverrides(original: readonly Token[], overrides: readonly TokenOverride[]): Token[] {
  return applyTokenOverridesDetailed(original, overrides, { strict: true }).tokens;
}

/** Spans for a line without corrections: token i came from [i, i]. */
export function identitySpans(count: number): TokenSpan[] {
  return Array.from({ length: count }, (_, i) => ({ start: i, end: i, corrected: false }));
}

