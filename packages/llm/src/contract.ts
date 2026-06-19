// The AI-layer contract (CONTRATO_IA.md). This file is the boundary between
// @fuchine/llm and the rest of the app: callers know exactly what they get,
// regardless of the provider behind it.

import type { Token, Explanation } from "@fuchine/db";

export type { Token, Explanation };
export type { ExplanationPart, PartTag } from "@fuchine/db";

/** prompt_version 2: breakdown + plainTerms shape (was summary/grammarPoints/nuance). */
export const PROMPT_VERSION = 2;

/** Cache "kind". Only "line" exists in the MVP; the rest are reserved. */
export type ExplanationKind = "line" | "word" | "grammar_drill";

/** Context handed to explainLine. Tokens come from layer 0 (CONTRATO §4.1). */
export type SubtitleLineCtx = {
  text: string;
  prevText: string | null;
  nextText: string | null;
  tokens: Token[];
  learningLanguage: string;
};

/**
 * Provider-agnostic AI surface (D5). Implementations: anthropic, openai,
 * gemini, ollama. Choice is configuration, not code.
 */
export interface LlmProvider {
  /**
   * Translate subtitle lines (layer 1). MUST return an array of the same
   * length and order as `lines`; each item is the translation or null
   * (SFX / blank / untranslatable). Alignment is the function's job, never
   * the caller's (CONTRATO §3.2, §3.3).
   */
  translateBatch(
    lines: string[],
    opts: { from: string; to: string },
  ): Promise<(string | null)[]>;

  /** Deep line explanation (layer 2), generated on demand and cached. */
  explainLine(
    ctx: SubtitleLineCtx,
    opts: { explanationLanguage: string },
  ): Promise<Explanation>;
}
