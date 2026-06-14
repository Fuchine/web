// Shared JSONB payload types. Source of truth for the shapes: CONTRATO_IA.md.

export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

// One token of a subtitle line. Produced by packages/nlp (layer 0).
// Stored in subtitle_lines.tokens.
export type Token = {
  surface: string; // form as it appears in text: 日本語
  lemma: string; // base form, used for dictionary lookup
  reading: string; // reading in hiragana: にほんご
  pos: string; // part of speech
  wordEntryId: string | null; // resolved dictionary entry, or null
};

// One grammar point inside an explanation.
export type GrammarPoint = {
  pattern: string; // japanese grammar form, e.g. 〜てしまう
  level: JlptLevel | null;
  explanation: string; // written in explanation_language
};

// Output of explainLine. Stored in ai_explanations.content.
export type Explanation = {
  summary: string; // sentence meaning, in explanation_language
  grammarPoints: GrammarPoint[]; // always present; may be empty
  nuance: string | null; // register / slang / cultural note; null if nothing notable
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
