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
};

/** Convert katakana to hiragana so readings normalize for lookup. */
export function kataToHira(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
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
  const kanaForms = word.kana.map((k) => k.text);
  const primaryReading = kanaForms[0];
  if (!primaryReading) return [];

  // Kanji entries: one row per written form, read by the primary kana.
  if (word.kanji.length > 0) {
    return word.kanji.map((k) => ({
      language: "ja",
      lemma: k.text,
      reading: primaryReading,
      pos,
      definitions,
    }));
  }

  // Kana-only entries: the kana is itself the lemma.
  return kanaForms.map((reading) => ({
    language: "ja",
    lemma: reading,
    reading,
    pos,
    definitions,
  }));
}
