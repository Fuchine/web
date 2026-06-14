// Layer 0 NLP: tokenizer + dictionary interfaces, per-language adapters,
// and a registry so callers pick an adapter by language code.

import type { Tokenizer } from "./interfaces";
import { JaTokenizer } from "./ja/tokenizer";

export * from "./interfaces";
export { JaTokenizer } from "./ja/tokenizer";
export { JaDictionary } from "./ja/dictionary";

const tokenizers: Record<string, () => Tokenizer> = {
  ja: () => new JaTokenizer(),
};

/** Get the tokenizer for a language, or throw if none is registered. */
export function getTokenizer(language: string): Tokenizer {
  const factory = tokenizers[language];
  if (!factory) {
    throw new Error(`No tokenizer registered for language "${language}"`);
  }
  return factory();
}
