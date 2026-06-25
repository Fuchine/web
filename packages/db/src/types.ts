// Shared JSONB payload types. Source of truth for the shapes: CONTRATO_IA.md.

// Coarse part-of-speech / role tag for a breakdown item (drives the UI chip).
export type PartTag =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "particle"
  | "grammar"
  | "expression";

// One token of a subtitle line. Produced by packages/nlp (layer 0).
// Stored in subtitle_lines.tokens.
export type Token = {
  surface: string; // form as it appears in text: 日本語
  lemma: string; // base form, used for dictionary lookup
  reading: string | null; // reading in hiragana (にほんご); null/"" when none (e.g. punctuation)
  romaji: string | null; // romanized reading (maiasa); null when none (e.g. punctuation)
  pos: string; // part of speech
  wordEntryId: string | null; // resolved dictionary entry, or null
};

// One part of an explanation breakdown (a span of the sentence).
export type ExplanationPart = {
  surface: string; // the span in Japanese; may cover several tokens (歩いて います)
  tag: PartTag; // coarse category for the UI chip
  gloss: string; // short label in explanation_language ("every morning")
  note: string; // one-sentence explanation in explanation_language
  accent?: boolean; // the single most important part to highlight
};

// Output of explainLine (prompt_version 2). Stored in ai_explanations.content.
export type Explanation = {
  breakdown: ExplanationPart[]; // ordered walk of the sentence's salient parts (cap 8)
  plainTerms: string; // "in plain terms" prose, in explanation_language
};

// One sense of a dictionary entry. Stored in word_entries.definitions.
// Mirrors a trimmed jmdict-simplified sense.
export type Definition = {
  glosses: string[]; // meanings in the user's language
  partsOfSpeech: string[];
  tags?: string[]; // e.g. "usually kana", "colloquial"
};

// user_settings.daily_goals
export type DailyGoals = {
  newCardsPerDay?: number;
  reviewMinutesPerDay?: number;
  watchMinutesPerDay?: number;
};
