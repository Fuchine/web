// i+1 lines (T3.10, innovation 1 part 2). A line is i+1 for a user when
// exactly ONE of its countable words (T3.9 coverage rules: isCoverageToken) is
// not yet confirmed/likely and the rest are — the sentence is comprehensible
// except for one new item, the ideal sentence card (Krashen's i+1; what
// AnkiMorphs automated). We only SUGGEST these lines (player marker + filter,
// curation suggestions); a card is never created without the user's click.
// Spec: docs/plans/2026-10-30-explore-spec.md (§ i+1).

import { and, asc, eq, inArray } from "drizzle-orm";
import {
  type Database,
  type Token,
  savedWords,
  sentenceCards,
  subtitleLines,
  userWordStats,
  videos,
  wordEntries,
} from "@fuchine/db";
import { isCoverageToken } from "@fuchine/nlp";
import { loadKnownWordParams, wordTierSqlFor, type KnownWordParams, type WordTier } from "./known-words";
import { withTokenOverrides } from "./token-overrides";

/** Known countable words a line needs around its one new word to count as i+1. */
export const I_PLUS_ONE_MIN_KNOWN = 2;

export type IPlusOne = {
  /** The one word not yet known. */
  wordEntryId: string;
  /** Index (in the user's corrected tokens) of its first occurrence. */
  tokenIdx: number;
};

const isKnown = (t: WordTier | undefined) => t === "confirmed" || t === "likely";

/**
 * Pure: the line's single unknown word, or null when the line is not i+1.
 * Counted per distinct WORD: a new word repeated in the line (ねえ、ねえ) is
 * still one new item. Tokens that are not countable (particles are; proper
 * nouns, numerals, symbols, interjections and entry-less tokens are not) are
 * ignored — they neither block nor make the line.
 */
export function detectIPlusOne(
  tokens: readonly Token[],
  language: string,
  entryPos: ReadonlyMap<string, string | null>,
  tiers: ReadonlyMap<string, WordTier>,
  minKnown: number = I_PLUS_ONE_MIN_KNOWN,
): IPlusOne | null {
  let unknown: IPlusOne | null = null;
  let known = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!t.wordEntryId || !isCoverageToken(t, language, entryPos.get(t.wordEntryId) ?? null)) continue;
    if (isKnown(tiers.get(t.wordEntryId))) {
      known++;
    } else if (!unknown) {
      unknown = { wordEntryId: t.wordEntryId, tokenIdx: i };
    } else if (unknown.wordEntryId !== t.wordEntryId) {
      return null; // a second new word
    }
  }
  return unknown && known >= minKnown ? unknown : null;
}

/**
 * Server side: i+1 per line for one user, over lines whose tokens are already
 * the user's corrected tokens (withTokenOverrides). ONE query resolves the
 * entry POS and the user's tier of every word involved (word_entries PK ⟕
 * user_word_stats PK ⟕ saved_words PK, tiered by the calibrated SQL rule).
 */
export async function getIPlusOneLines(
  db: Database,
  userId: string,
  lines: readonly { id: string; tokens: readonly Token[] }[],
  language: string,
  knownParams?: KnownWordParams,
): Promise<Map<string, IPlusOne>> {
  const out = new Map<string, IPlusOne>();
  const ids = [...new Set(lines.flatMap((l) => l.tokens.flatMap((t) => (t.wordEntryId ? [t.wordEntryId] : []))))];
  if (ids.length === 0) return out;
  const params = knownParams ?? (await loadKnownWordParams(db, userId));
  const tierSql = wordTierSqlFor(params.likelyMinViews);
  const rows = await db
    .select({ id: wordEntries.id, pos: wordEntries.pos, tier: tierSql })
    .from(wordEntries)
    .leftJoin(userWordStats, and(eq(userWordStats.userId, userId), eq(userWordStats.wordEntryId, wordEntries.id)))
    .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, wordEntries.id)))
    .where(inArray(wordEntries.id, ids));
  const entryPos = new Map(rows.map((r) => [r.id, r.pos]));
  const tiers = new Map(rows.map((r) => [r.id, r.tier]));
  for (const l of lines) {
    const hit = detectIPlusOne(l.tokens, language, entryPos, tiers);
    if (hit) out.set(l.id, hit);
  }
  return out;
}

export type IPlusOneSuggestion = {
  lineId: string;
  idx: number;
  tStartMs: number;
  tEndMs: number;
  textOriginal: string;
  textTranslation: string | null;
  target: { wordEntryId: string; surface: string; reading: string | null };
};

/**
 * i+1 lines of one video the user has NOT mined yet, in video order (the
 * curation screen's "Mine this i+1 line" suggestions). Null = no such video.
 */
export async function listIPlusOneSuggestions(
  db: Database,
  userId: string,
  videoId: string,
  limit = 3,
): Promise<IPlusOneSuggestion[] | null> {
  const [video] = await db.select({ language: videos.language }).from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return null;
  const shared = await db
    .select({
      id: subtitleLines.id,
      idx: subtitleLines.idx,
      tStartMs: subtitleLines.tStartMs,
      tEndMs: subtitleLines.tEndMs,
      textOriginal: subtitleLines.textOriginal,
      textTranslation: subtitleLines.textTranslation,
      tokens: subtitleLines.tokens,
    })
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, videoId))
    .orderBy(asc(subtitleLines.idx));
  const [lines, mined] = await Promise.all([
    withTokenOverrides(db, userId, shared, (l) => l.id),
    db
      .select({ lineId: sentenceCards.subtitleLineId })
      .from(sentenceCards)
      .where(and(eq(sentenceCards.userId, userId), eq(sentenceCards.videoId, videoId))),
  ]);
  const minedIds = new Set(mined.map((m) => m.lineId));
  const candidates = lines.filter((l) => !minedIds.has(l.id));
  const hits = await getIPlusOneLines(db, userId, candidates, video.language);
  const out: IPlusOneSuggestion[] = [];
  for (const l of candidates) {
    const hit = hits.get(l.id);
    if (!hit) continue;
    const t = l.tokens[hit.tokenIdx]!;
    out.push({
      lineId: l.id,
      idx: l.idx,
      tStartMs: l.tStartMs,
      tEndMs: l.tEndMs,
      textOriginal: l.textOriginal,
      textTranslation: l.textTranslation,
      target: { wordEntryId: hit.wordEntryId, surface: t.surface, reading: t.reading ?? null },
    });
    if (out.length >= limit) break;
  }
  return out;
}
