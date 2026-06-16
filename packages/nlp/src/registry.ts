import type { Database } from "@fuchine/db";
import type { DictionaryProvider, Tokenizer } from "./interfaces";
import { JaTokenizer } from "./ja/tokenizer";
import { JaDictionary } from "./ja/dictionary";

const tokenizers: Record<string, () => Tokenizer> = {
  ja: () => new JaTokenizer(),
};

const dictionaries: Record<string, (db: Database) => DictionaryProvider> = {
  ja: (db) => new JaDictionary(db),
};

/** Get the tokenizer for a language, or throw if none is registered. */
export function getTokenizer(language: string): Tokenizer {
  const factory = tokenizers[language];
  if (!factory) {
    throw new Error(`No tokenizer registered for language "${language}"`);
  }
  return factory();
}

/** Get the dictionary provider for a language, or throw if none is registered. */
export function getDictionary(language: string, db: Database): DictionaryProvider {
  const factory = dictionaries[language];
  if (!factory) {
    throw new Error(`No dictionary registered for language "${language}"`);
  }
  return factory(db);
}
