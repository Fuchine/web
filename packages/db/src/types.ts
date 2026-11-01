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
  // Finer POS (kuromoji pos_detail_1: 固有名詞, 数, 代名詞…), when the tokenizer
  // gives one. Optional: tokens stored before T3.9 and user corrections lack
  // it. Read by the coverage exclusions (isCoverageToken in @fuchine/nlp).
  posDetail?: string;
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
  maxReviewsPerDay?: number; // cap on due (non-new) cards surfaced per day
  reviewMinutesPerDay?: number;
  watchMinutesPerDay?: number;
};

/**
 * Measured known-word parameters (T3.10), written by the daily calibration job
 * (runKnownWordCalibration) to instance_settings["known_words"] and, when a
 * user has enough data of their own, to user_settings.known_word_params. The
 * coverage formula and the tier rule read them instead of the constants.
 */
export type KnownWordCalibration = {
  /** P(first review OK | likely) — the headline weight of a likely token. */
  likelyWeight: number;
  /** Suggested views threshold for "likely" (the tier rule uses it). */
  likelyMinViews: number;
  /** Exact "likely" first reviews the numbers rest on (≥ CALIBRATION_MIN_SAMPLE). */
  samples: number;
  /** Unrounded P(OK | likely), for the report. */
  okRate: number;
  scope: "instance" | "user";
  computedAt: string; // ISO
};

/* ------------------------------------------------------------------ */
/* Imported dictionaries (T3.4, Yomitan format)                        */
/* ------------------------------------------------------------------ */

/**
 * Structured content as Fuchine stores it: Yomitan's structured-content
 * (dictionary-term-bank-v3 schema) reduced by the importer to a whitelist —
 * no images, no data-* attributes, no free-form styles, links only http(s).
 * The renderer (@fuchine/ui StructuredContent) re-checks every node anyway.
 */
export type ScTag =
  | "div" | "span" | "ul" | "ol" | "li"
  | "table" | "thead" | "tbody" | "tfoot" | "tr" | "td" | "th"
  | "ruby" | "rt" | "rp" | "br" | "a" | "details" | "summary";

/** The only style properties kept, each with a closed set of values. */
export type ScStyle = {
  fontWeight?: "bold";
  fontStyle?: "italic";
  textDecorationLine?: "underline" | "line-through" | "overline";
  verticalAlign?: "sub" | "super";
};

export type ScElement = {
  tag: ScTag;
  content?: ScNode;
  href?: string; // only on "a"; http(s) only
  lang?: string;
  title?: string;
  colSpan?: number;
  rowSpan?: number;
  style?: ScStyle;
};

export type ScNode = string | ScNode[] | ScElement;

/** One definition of an imported term (images are dropped at import). */
export type DictDefinition =
  | { type: "text"; text: string }
  | { type: "sc"; content: ScNode };

/** dictionaries.tag_meta: tag name → its display info from tag_bank_*.json. */
export type DictTagMeta = Record<string, { category?: string; notes?: string }>;

/**
 * user_settings.dictionary_prefs: which instance dictionaries the user shows,
 * in order (ids of `dictionaries`), and the frequency list that drives the
 * Lapis export's Frequency/FreqSort. Null / missing = none (JMdict only).
 */
export type DictionaryPrefs = {
  enabled?: string[];
  frequency?: string | null;
};
