// Layer 0 NLP: tokenizer + dictionary interfaces, per-language adapters, a
// registry to pick adapters by language code, and line analysis (tokenize +
// resolve dictionary entries).

export * from "./interfaces";
export { JaTokenizer } from "./ja/tokenizer";
export { JaDictionary, groupHitsByLemma } from "./ja/dictionary";
export { kataToHira, hiraToRomaji } from "./ja/kana";
export { getTokenizer, getDictionary } from "./registry";
export {
  resolveWordEntries,
  analyzeLine,
  analyzeLines,
  lookupLemmas,
  resolveTokensFromHits,
} from "./analyze";
