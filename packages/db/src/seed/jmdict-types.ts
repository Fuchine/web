// Subset of the jmdict-simplified JSON format that the seed consumes.
// Full spec: https://github.com/scriptin/jmdict-simplified
// We only read what maps onto `word_entries` (CONTRATO_IA Definition shape).

export type JmdictGloss = {
  lang: string; // "eng" in jmdict-eng
  text: string;
};

export type JmdictSense = {
  partOfSpeech: string[]; // e.g. ["n"], ["v5k-s", "vi"]
  misc: string[]; // e.g. ["uk"] (usually kana)
  field: string[]; // e.g. ["comp"]
  dialect: string[];
  gloss: JmdictGloss[];
};

export type JmdictKanji = { text: string; common: boolean; tags: string[] };
export type JmdictKana = { text: string; common: boolean; tags: string[] };

export type JmdictWord = {
  id: string;
  kanji: JmdictKanji[];
  kana: JmdictKana[];
  sense: JmdictSense[];
};

export type JmdictFile = {
  version?: string;
  languages?: string[];
  words: JmdictWord[];
};
