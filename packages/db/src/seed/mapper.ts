// Map a jmdict-simplified entry onto word_entries rows.
//
// One JMdict entry can have several written (kanji) forms and several readings.
// We emit one row per written form (lemma = that form), or one row per reading
// when the entry is kana-only. Each row carries all senses as `definitions`.

import type { Definition } from "../types";
import type { JmdictWord } from "./jmdict-types";

export type SeedRow = {
  language: string;
  lemma: string;
  reading: string;
  pos: string | null;
  definitions: Definition[];
  // Coarse frequency rank derived from JMdict's own nfXX priority tags (null when
  // the form carries no frequency tag). An external list, if seeded, overrides it.
  nfRank: number | null;
};

/** Convert katakana to hiragana so readings normalize for lookup. */
export function kataToHira(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

const NF_TAG = /^nf(\d{2})$/;

/**
 * JMdict marks common forms with an `nfXX` tag: a band of 500 words by
 * frequency (nf01 = the 500 most frequent, nf02 = 501–1000, …, nf48 =
 * 23,500–24,000). Map the most frequent band present to that band's midpoint
 * rank; forms with no nf tag return null. This is the JMdict-native frequency
 * signal (EDRDG license, already used) — no external list required.
 */
export function nfRankFromTags(tags: string[]): number | null {
  let best: number | null = null;
  for (const tag of tags) {
    const m = NF_TAG.exec(tag);
    if (!m) continue;
    const band = Number.parseInt(m[1]!, 10); // 1..48
    if (band < 1) continue;
    const rank = (band - 1) * 500 + 250; // band midpoint
    if (best === null || rank < best) best = rank;
  }
  return best;
}

function toDefinitions(word: JmdictWord): Definition[] {
  return word.sense.map((s) => {
    const tags = [...s.misc, ...s.field, ...s.dialect];
    const def: Definition = {
      glosses: s.gloss.map((g) => g.text),
      partsOfSpeech: s.partOfSpeech,
    };
    if (tags.length > 0) def.tags = tags;
    return def;
  });
}

function distinctPos(word: JmdictWord): string | null {
  const pos = [...new Set(word.sense.flatMap((s) => s.partOfSpeech))];
  return pos.length > 0 ? pos.join(",") : null;
}

/** Produce the word_entries rows for one JMdict entry (language is always "ja"). */
export function mapWord(word: JmdictWord): SeedRow[] {
  const definitions = toDefinitions(word);
  if (definitions.every((d) => d.glosses.length === 0)) return [];

  const pos = distinctPos(word);
  const primaryKana = word.kana[0];
  if (!primaryKana) return [];
  const primaryReading = primaryKana.text;
  const readingNf = nfRankFromTags(primaryKana.tags);

  // Kanji entries: one row per written form, read by the primary kana. Rank the
  // form by its own nf tag, else fall back to the primary reading's.
  if (word.kanji.length > 0) {
    return word.kanji.map((k) => ({
      language: "ja",
      lemma: k.text,
      reading: primaryReading,
      pos,
      definitions,
      nfRank: nfRankFromTags(k.tags) ?? readingNf,
    }));
  }

  // Kana-only entries: the kana is itself the lemma; rank by its own nf tag.
  return word.kana.map((k) => ({
    language: "ja",
    lemma: k.text,
    reading: k.text,
    pos,
    definitions,
    nfRank: nfRankFromTags(k.tags),
  }));
}
