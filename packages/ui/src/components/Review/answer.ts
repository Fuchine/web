// Cloze target choice + tolerant answer comparison (T3.11). Pure.
// pickClozeTarget is also the Anki export's "target word" rule (T3.3) — the
// web app imports it through the `@fuchine/ui/answer` subpath (no React).
//
// The learner types the blanked word. Japanese has several valid spellings for
// the same word, so we accept the surface as written, its dictionary form, and
// either reading — compared after NFKC + katakana→hiragana normalization, so
// 勉強 / べんきょう / ベンキョウ / ﾍﾞﾝｷｮｳ all match.

import { kataToHira } from "@fuchine/nlp/client";

export interface ClozeToken {
  surface: string;
  lemma: string;
  reading: string | null;
  pos: string;
  wordEntryId: string | null;
}

export interface ClozeEntry {
  reading: string;
  lemma: string;
  definitions: { glosses: string[] }[];
  /** JMdict-derived frequency band (lower = more common); null/undefined = unranked. */
  frequencyRank?: number | null;
}

export interface ClozeTarget {
  surface: string;
  /** Reading of the surface as it appears in the line (hiragana). */
  reading: string;
  lemma: string;
  /** Dictionary reading of the lemma. */
  lemmaReading: string;
  meanings: string[];
  /** Index of the chosen token in the line's tokens (set by pickClozeTarget). */
  tokenIndex?: number;
  /** Dictionary entry of the chosen token, when it resolved to one. */
  wordEntryId?: string | null;
}

const PUNCT = /[\s　。、，．,.!?！？「」『』（）()［］[\]・〜~…‥:：;；"'“”‘’]/g;

/** Canonical form for comparison: NFKC, katakana→hiragana, lower-case, no spaces/punctuation. */
export function normalizeAnswer(input: string): string {
  return kataToHira(input.normalize("NFKC")).toLowerCase().replace(PUNCT, "");
}

/** Every spelling we accept for the target, normalized and de-duplicated. */
export function acceptedAnswers(target: Pick<ClozeTarget, "surface" | "reading" | "lemma" | "lemmaReading">): string[] {
  const all = [target.surface, target.lemma, target.reading, target.lemmaReading]
    .map((s) => normalizeAnswer(s ?? ""))
    .filter((s) => s.length > 0);
  return [...new Set(all)];
}

export function checkClozeAnswer(input: string, target: Pick<ClozeTarget, "surface" | "reading" | "lemma" | "lemmaReading">): boolean {
  const given = normalizeAnswer(input);
  if (given === "") return false;
  return acceptedAnswers(target).includes(given);
}

// Function words are never worth blanking: particles, auxiliaries, symbols,
// fillers, prefixes (IPADIC top-level POS, plus the English labels used in tests).
const SKIP_POS = ["助詞", "助動詞", "記号", "補助記号", "フィラー", "接頭詞", "particle", "auxiliary", "symbol", "punct"];

function isContentToken(t: ClozeToken): boolean {
  const pos = (t.pos ?? "").toLowerCase();
  if (SKIP_POS.some((p) => pos.startsWith(p.toLowerCase()))) return false;
  return normalizeAnswer(t.surface).length > 0;
}

/**
 * Pick the word to blank: the rarest content word that has a dictionary entry
 * (highest frequency band; an unranked entry counts as rarer than any ranked
 * one). Ties → longer surface, then later in the line. Content words without an
 * entry are a fallback; null when the line has nothing sensible to blank.
 */
export function pickClozeTarget(
  sentence: string,
  tokens: ClozeToken[],
  entries: Record<string, ClozeEntry>,
): ClozeTarget | null {
  type Cand = { t: ClozeToken; entry: ClozeEntry | null; idx: number };
  const cands: Cand[] = tokens
    .map((t, idx) => ({ t, idx, entry: t.wordEntryId ? entries[t.wordEntryId] ?? null : null }))
    .filter((c) => c.t.surface !== "" && sentence.includes(c.t.surface) && isContentToken(c.t));
  if (cands.length === 0) return null;

  const rarity = (c: Cand) =>
    c.entry == null ? -1 : c.entry.frequencyRank == null ? Number.MAX_SAFE_INTEGER : c.entry.frequencyRank;

  cands.sort((a, b) =>
    rarity(b) - rarity(a) || b.t.surface.length - a.t.surface.length || b.idx - a.idx,
  );
  const best = cands[0]!;
  const lemmaReading = best.entry?.reading ?? "";
  return {
    surface: best.t.surface,
    reading: best.t.reading ? kataToHira(best.t.reading) : lemmaReading,
    lemma: best.entry?.lemma || best.t.lemma || best.t.surface,
    lemmaReading,
    meanings: best.entry ? best.entry.definitions.flatMap((d) => d.glosses) : [],
    tokenIndex: best.idx,
    wordEntryId: best.entry ? best.t.wordEntryId : null,
  };
}
