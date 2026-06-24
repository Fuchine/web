// Japanese conjugation generator (F2 dictionary). Pure — no server deps, so it
// is safe to import directly in a client component. Covers godan/ichidan/suru/
// kuru verbs and i-adjectives; returns null for everything else.

export type ConjForm = { label: string; word: string; reading: string };

type GodanRow = { te: string; ta: string; nai: string; masu: string; pot: string };

// Suffixes that REPLACE the dictionary form's final kana, per godan ending.
const GODAN: Record<string, GodanRow> = {
  "く": { te: "いて", ta: "いた", nai: "かない", masu: "きます", pot: "ける" },
  "ぐ": { te: "いで", ta: "いだ", nai: "がない", masu: "ぎます", pot: "げる" },
  "す": { te: "して", ta: "した", nai: "さない", masu: "します", pot: "せる" },
  "つ": { te: "って", ta: "った", nai: "たない", masu: "ちます", pot: "てる" },
  "ぬ": { te: "んで", ta: "んだ", nai: "なない", masu: "にます", pot: "ねる" },
  "ぶ": { te: "んで", ta: "んだ", nai: "ばない", masu: "びます", pot: "べる" },
  "む": { te: "んで", ta: "んだ", nai: "まない", masu: "みます", pot: "める" },
  "る": { te: "って", ta: "った", nai: "らない", masu: "ります", pot: "れる" },
  "う": { te: "って", ta: "った", nai: "わない", masu: "います", pot: "える" },
};
// 行く (v5k-s): euphonic te/ta like つ-row, the rest like く-row.
const IKU: GodanRow = { te: "って", ta: "った", nai: "かない", masu: "きます", pot: "ける" };

function godanForms(lemma: string, reading: string, row: GodanRow): ConjForm[] {
  const drop = (s: string, suf: string) => s.slice(0, -1) + suf;
  return [
    { label: "Dictionary", word: lemma, reading },
    { label: "Te-form", word: drop(lemma, row.te), reading: drop(reading, row.te) },
    { label: "Past", word: drop(lemma, row.ta), reading: drop(reading, row.ta) },
    { label: "Negative", word: drop(lemma, row.nai), reading: drop(reading, row.nai) },
    { label: "Polite", word: drop(lemma, row.masu), reading: drop(reading, row.masu) },
    { label: "Potential", word: drop(lemma, row.pot), reading: drop(reading, row.pot) },
  ];
}

function ichidanForms(lemma: string, reading: string): ConjForm[] {
  const stem = (s: string) => s.slice(0, -1); // drop る
  const f = (suf: string) => ({ word: stem(lemma) + suf, reading: stem(reading) + suf });
  return [
    { label: "Dictionary", word: lemma, reading },
    { label: "Te-form", ...f("て") },
    { label: "Past", ...f("た") },
    { label: "Negative", ...f("ない") },
    { label: "Polite", ...f("ます") },
    { label: "Potential", ...f("られる") },
  ];
}

function suruForms(lemma: string, reading: string): ConjForm[] {
  const base = (s: string) => (s.endsWith("する") ? s.slice(0, -2) : s);
  const lb = base(lemma), rb = base(reading);
  const f = (suf: string) => ({ word: lb + suf, reading: rb + suf });
  return [
    { label: "Dictionary", ...f("する") },
    { label: "Te-form", ...f("して") },
    { label: "Past", ...f("した") },
    { label: "Negative", ...f("しない") },
    { label: "Polite", ...f("します") },
    { label: "Potential", ...f("できる") },
  ];
}

function kuruForms(lemma: string, reading: string): ConjForm[] {
  const kana = { dict: "くる", te: "きて", ta: "きた", nai: "こない", masu: "きます", pot: "こられる" };
  const isKanji = lemma !== reading && lemma.endsWith("る"); // 来る vs kana くる
  const stem = lemma.slice(0, -1); // 来
  const w = isKanji
    ? { dict: lemma, te: stem + "て", ta: stem + "た", nai: stem + "ない", masu: stem + "ます", pot: stem + "られる" }
    : kana;
  return [
    { label: "Dictionary", word: w.dict, reading: kana.dict },
    { label: "Te-form", word: w.te, reading: kana.te },
    { label: "Past", word: w.ta, reading: kana.ta },
    { label: "Negative", word: w.nai, reading: kana.nai },
    { label: "Polite", word: w.masu, reading: kana.masu },
    { label: "Potential", word: w.pot, reading: kana.pot },
  ];
}

function iAdjForms(lemma: string, reading: string): ConjForm[] {
  const stem = (s: string) => s.slice(0, -1); // drop い
  const f = (suf: string) => ({ word: stem(lemma) + suf, reading: stem(reading) + suf });
  return [
    { label: "Dictionary", word: lemma, reading },
    { label: "Te-form", ...f("くて") },
    { label: "Past", ...f("かった") },
    { label: "Negative", ...f("くない") },
  ];
}

/**
 * Conjugate a dictionary entry. Returns null for non-conjugating words
 * (noun, na-adjective, …), missing reading/pos, or an unexpected godan ending
 * (better no table than a wrong one).
 */
export function conjugate(lemma: string, reading: string | null, pos: string | null): ConjForm[] | null {
  if (!reading || !pos) return null;
  const codes = pos.split(",").map((c) => c.trim());

  if (codes.includes("v5k-s")) return godanForms(lemma, reading, IKU);
  if (codes.includes("v1")) return ichidanForms(lemma, reading);
  if (codes.includes("vk")) return kuruForms(lemma, reading);
  if (codes.includes("vs-i") || codes.includes("vs") || codes.includes("vs-s")) return suruForms(lemma, reading);
  if (codes.includes("adj-i")) return iAdjForms(lemma, reading);

  if (codes.some((c) => /^v5[kgstnbmru]$/.test(c))) {
    const row = GODAN[lemma.slice(-1)];
    return row ? godanForms(lemma, reading, row) : null;
  }
  return null;
}
