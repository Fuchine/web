// Japanese pitch accent (T3.2): turn (reading, downstep) into a per-mora
// high/low pattern and its category. Pure — shared by the dictionary popup, the
// dictionary screen and (T3.3) the Lapis export's PitchPosition/PitchCategories.
//
// Notation (Kanjium, NHK, Lapis): the number is the mora AFTER which the pitch
// drops. 0 = no drop inside the word (heiban): the first mora is low, the rest
// high, and a following particle stays high. n ≥ 1: mora 1 is high only when
// n = 1; otherwise mora 1 is low, morae 2..n high, everything after low.

/** Small kana that merge with the preceding mora (きゃ, ファ, ヴィ…). */
const SMALL_KANA = new Set([..."ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ"]);

/**
 * Split a kana reading into morae. Small ゃゅょ/ぁぃぅぇぉ/ゎ join the previous
 * mora; sokuon っ, the long-vowel mark ー and ん are morae of their own.
 */
export function splitMorae(reading: string): string[] {
  const morae: string[] = [];
  for (const ch of reading) {
    if (SMALL_KANA.has(ch) && morae.length > 0) {
      morae[morae.length - 1] += ch;
    } else {
      morae.push(ch);
    }
  }
  return morae;
}

export type PitchCategory = "heiban" | "atamadaka" | "nakadaka" | "odaka";

export const PITCH_CATEGORY_LABEL: Record<PitchCategory, { en: string; ja: string }> = {
  heiban: { en: "Heiban", ja: "平板" },
  atamadaka: { en: "Atamadaka", ja: "頭高" },
  nakadaka: { en: "Nakadaka", ja: "中高" },
  odaka: { en: "Odaka", ja: "尾高" },
};

/**
 * Category of a downstep position for a word of `moraCount` morae, or null when
 * the position is out of range. A one-mora word with drop 1 is atamadaka (the
 * conventional label; it is also, trivially, the last mora).
 */
export function pitchCategory(moraCount: number, downstep: number): PitchCategory | null {
  if (!Number.isInteger(downstep) || downstep < 0 || downstep > moraCount || moraCount < 1) return null;
  if (downstep === 0) return "heiban";
  if (downstep === 1) return "atamadaka";
  if (downstep === moraCount) return "odaka";
  return "nakadaka";
}

export type PitchPattern = {
  downstep: number;
  morae: string[];
  /** One flag per mora: true = high. */
  high: boolean[];
  /** Pitch of a following particle (が, は…): high only for heiban. */
  particleHigh: boolean;
  /** Index of the last high mora before the drop, or null (heiban). */
  dropAfter: number | null;
  category: PitchCategory;
};

/** Full pattern for one reading + downstep, or null when they don't fit. */
export function pitchPattern(reading: string, downstep: number): PitchPattern | null {
  const morae = splitMorae(reading);
  const category = pitchCategory(morae.length, downstep);
  if (!category) return null;
  const high = morae.map((_, i) => {
    if (downstep === 0) return i > 0;
    if (downstep === 1) return i === 0;
    return i > 0 && i < downstep;
  });
  // A one-mora heiban word (日 ひ 0) is low on its own and rises on the particle.
  return {
    downstep,
    morae,
    high,
    particleHigh: downstep === 0,
    dropAfter: downstep === 0 ? null : downstep - 1,
    category,
  };
}

/** Distinct categories for a set of downsteps, in first-seen order (Lapis PitchCategories). */
export function pitchCategories(reading: string, positions: readonly number[]): PitchCategory[] {
  const morae = splitMorae(reading).length;
  const out: PitchCategory[] = [];
  for (const p of positions) {
    const c = pitchCategory(morae, p);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}
