// Client-safe entry point: only JaTokenizer, no DB dependencies.
// Use this from browser/UI code. The full @fuchine/nlp (with DB) is server-only.
export { JaTokenizer } from "./ja/tokenizer-stub";
export { kataToHira } from "./ja/kana";
export type { Tokenizer } from "./interfaces";
export type { Token } from "@fuchine/db";
