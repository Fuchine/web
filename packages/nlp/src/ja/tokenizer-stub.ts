// Browser-safe stub tokenizer — used by @fuchine/ui (client-side).
// This is a simplified tokenizer that returns basic token info.
// The full kuromoji-based tokenizer runs server-side only.

import type { Token } from "@fuchine/db";
import type { Tokenizer } from "../interfaces";

/**
 * Browser-compatible tokenizer stub.
 * Returns tokens with surface and basic info only — no reading/pos/lemma resolution.
 * For full tokenization (reading, lemma, POS), use the server-side JaTokenizer.
 */
export class JaTokenizer implements Tokenizer {
  readonly language = "ja";

  async tokenize(text: string): Promise<Token[]> {
    if (text.trim().length === 0) return [];
    // Simple character-based segmentation as fallback
    // Real implementation: use a WASM-based or dictionary-based approach
    return text.split(/([\s，。！？、「」『』（）]|(?=[A-Za-z])+(?![A-Za-z])|(?![A-Za-z])+(?=[A-Za-z]))/).filter(Boolean).map((surface) => ({
      surface,
      lemma: surface,
      reading: "",
      pos: "unknown",
      wordEntryId: null,
    }));
  }
}
