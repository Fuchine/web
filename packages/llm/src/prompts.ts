// Prompts that implement CONTRATO_IA for an OpenAI-compatible chat model.
// Both functions ask for a JSON *object* so json_object response mode works.

import type { SubtitleLineCtx } from "./contract";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const LANGUAGE_NAMES: Record<string, string> = {
  ja: "Japanese",
  en: "English",
  pt: "Portuguese",
  es: "Spanish",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/** translateBatch (layer 1): one chunk of lines -> {"translations": [...]}. */
export function buildTranslateMessages(
  lines: string[],
  from: string,
  to: string,
): ChatMessage[] {
  const system =
    `You are a professional subtitle translator translating from ` +
    `${languageName(from)} to ${languageName(to)}. ` +
    `Return ONLY a JSON object of the form {"translations": [...]} whose array ` +
    `has EXACTLY ${lines.length} elements, one per input line, in the same order. ` +
    `Each element is the translated string, or null when the line has nothing to ` +
    `translate (sound effects, music such as ♪…♪, empty lines, or ` +
    `untranslatable noise). Translate naturally for subtitles; keep it concise. ` +
    `Do not add commentary, romaji, or any field other than "translations".`;

  const user = JSON.stringify({ lines });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** translateBatch fallback: a single line -> {"translation": string|null}. */
export function buildTranslateOneMessages(
  line: string,
  from: string,
  to: string,
): ChatMessage[] {
  const system =
    `You are a professional subtitle translator from ${languageName(from)} to ` +
    `${languageName(to)}. Return ONLY a JSON object {"translation": string|null}: ` +
    `the translated line, or null if there is nothing to translate. No commentary.`;
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ line }) },
  ];
}

/** explainLine (layer 2): a line in context -> the v2 Explanation object. */
export function buildExplainMessages(
  ctx: SubtitleLineCtx,
  explanationLanguage: string,
): ChatMessage[] {
  const lang = languageName(explanationLanguage);
  const system =
    `You explain ${languageName(ctx.learningLanguage)} sentences for a learner, ` +
    `writing in ${lang}. Return ONLY a JSON object with this exact shape:\n` +
    `{\n` +
    `  "breakdown": [            // ordered, at most 8 salient parts of the sentence\n` +
    `    { "surface": string,    // the span in Japanese (may cover several tokens, e.g. 歩いて います)\n` +
    `      "tag": "noun"|"verb"|"adjective"|"adverb"|"particle"|"grammar"|"expression",\n` +
    `      "gloss": string,      // a short label in ${lang} (e.g. "every morning")\n` +
    `      "note": string,       // ONE sentence explaining this part, in ${lang}\n` +
    `      "accent": boolean }   // true for THE single most important part, else omit/false\n` +
    `  ],\n` +
    `  "plainTerms": string      // 1-3 sentences, in ${lang}, explaining what the whole line means and why it reads naturally\n` +
    `}\n` +
    `Walk the sentence left to right. Merge trivial tokens; skip pure punctuation. ` +
    `Prioritize what a learner likely does not know. Do NOT include romaji (readings ` +
    `already come from tokens). If the line is untranslatable noise, return an empty ` +
    `breakdown [] and say so in plainTerms.`;

  const tokenHint = ctx.tokens
    .map((t) => `${t.surface}(${t.reading || "?"}/${t.pos})`)
    .join(" ");

  const user = JSON.stringify({
    line: ctx.text,
    previousLine: ctx.prevText,
    nextLine: ctx.nextText,
    tokens: tokenHint,
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
