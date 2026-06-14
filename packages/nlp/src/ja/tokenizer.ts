import type { Token } from "../interfaces";

/**
 * Japanese tokenizer (layer 0).
 *
 * MVP target: kuromoji.js running in the worker (no extra infra). Upgrade path
 * is a Python SudachiPy microservice behind this same interface (ARQUITETURA §7).
 *
 * F0 placeholder: returns the whole line as a single unresolved token so the
 * import pipeline runs end-to-end. Replace `tokenize` with kuromoji output.
 */
export class JaTokenizer {
  readonly language = "ja";

  // eslint-disable-next-line @typescript-eslint/require-await
  async tokenize(text: string): Promise<Token[]> {
    const surface = text.trim();
    if (surface.length === 0) return [];
    // TODO(nlp): wire kuromoji.js — surface/lemma/reading/pos per morpheme,
    // then resolve wordEntryId against word_entries.
    return [
      {
        surface,
        lemma: surface,
        reading: "",
        pos: "unknown",
        wordEntryId: null,
      },
    ];
  }
}
