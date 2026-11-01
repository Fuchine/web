// Hand-written model outputs (raw response text) for the eval unit tests.
// GOOD_* should pass every check for their gold item; BAD_* each break
// something specific. Keyed by the gold item id they answer.

export const GOOD: Record<string, string> = {
  "wa-ga-02": JSON.stringify({
    breakdown: [
      { surface: "象は", tag: "particle", gloss: "as for elephants", note: "は marks the topic of the whole sentence: we are talking about elephants." },
      { surface: "鼻が", tag: "particle", gloss: "the trunk (subject)", note: "が marks the subject of 長い inside that topic.", accent: true },
      { surface: "長い", tag: "adjective", gloss: "is long", note: "An i-adjective acting as the predicate." },
    ],
    plainTerms: "Elephants have long trunks. The topic is elephants, and within that topic the trunk is the subject that is long.",
  }),
  "teiru-01": "```json\n" + JSON.stringify({
    breakdown: [
      { surface: "今", tag: "noun", gloss: "now", note: "A time word placing the action in the present moment." },
      { surface: "ご飯を", tag: "noun", gloss: "a meal (object)", note: "を marks the meal as the thing being eaten." },
      { surface: "食べて いる", tag: "grammar", gloss: "is eating", note: "Te-form + いる shows an action in progress right now.", accent: true },
    ],
    plainTerms: "I'm eating right now. The ている form describes something that is ongoing at this moment.",
  }) + "\n```",
  "noise-01": JSON.stringify({ breakdown: [], plainTerms: "This line is a music marker; there is nothing to explain." }),
  "tags-01": JSON.stringify({
    breakdown: [
      { surface: "毎朝", tag: "adverb", gloss: "every morning", note: "Sets when the action happens." },
      { surface: "パンを", tag: "noun", gloss: "bread (object)", note: "The object, marked by the particle that follows." },
      { surface: "食べます", tag: "verb", gloss: "eat", note: "Polite present of the verb to eat; here it reads as a habit.", accent: true },
    ],
    plainTerms: "I eat bread every morning. The polite present describes a habit.",
  }),
};

export const BAD = {
  /** Hallucinated particle がは, a surface not in the line, two accents. */
  hallucinated: JSON.stringify({
    breakdown: [
      { surface: "象がは", tag: "particle", gloss: "topic+subject", note: "がは marks both topic and subject.", accent: true },
      { surface: "鼻", tag: "noun", gloss: "nose", note: "The trunk.", accent: true },
    ],
    plainTerms: "Elephants have long noses.",
  }),
  /** Schema drift: invalid tag, extra keys, missing note, v1 field. */
  schemaDrift: JSON.stringify({
    summary: "old v1 field",
    breakdown: [
      { surface: "象は", tag: "topic-marker", gloss: "elephants", reading: "ぞうは" },
      { surface: "鼻が", tag: "particle", gloss: "trunk", note: "Subject." },
    ],
    plainTerms: "Elephants have long trunks; the topic and the subject differ.",
  }),
  /** Romaji in the prose. */
  romaji: JSON.stringify({
    breakdown: [
      { surface: "象は", tag: "particle", gloss: "as for elephants", note: "The topic marker は (wa) sets the topic." },
      { surface: "鼻が", tag: "particle", gloss: "trunk", note: "The particle ga marks the subject." },
    ],
    plainTerms: "Zou wa hana ga nagai: elephants have long trunks, with a topic and a subject.",
  }),
  /** plainTerms written in Portuguese instead of English. */
  wrongLanguage: JSON.stringify({
    breakdown: [
      { surface: "象は", tag: "particle", gloss: "as for elephants", note: "Topic." },
      { surface: "鼻が", tag: "particle", gloss: "trunk", note: "Subject." },
    ],
    plainTerms: "Os elefantes têm a tromba comprida; é uma frase com tópico e sujeito, não uma pergunta.",
  }),
  /** Not JSON at all. */
  prose: "Sure! This sentence means elephants have long trunks.",
};
