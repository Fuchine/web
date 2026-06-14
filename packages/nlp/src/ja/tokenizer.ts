import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import kuromoji, {
  type IpadicFeatures,
  type Tokenizer as KuromojiTokenizer,
} from "kuromoji";
import type { Token, Tokenizer } from "../interfaces";
import { kataToHira } from "./kana";

// kuromoji ships its IPADIC under the package's `dict/` directory.
const require = createRequire(import.meta.url);
const DIC_PATH = join(dirname(require.resolve("kuromoji/package.json")), "dict");

// Building the tokenizer loads the dictionary (~a few hundred ms), so do it
// once and reuse the instance across calls.
let buildPromise: Promise<KuromojiTokenizer<IpadicFeatures>> | null = null;

function buildKuromoji(): Promise<KuromojiTokenizer<IpadicFeatures>> {
  if (!buildPromise) {
    buildPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
    });
  }
  return buildPromise;
}

function notEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== "" && value !== "*";
}

/**
 * Japanese tokenizer (layer 0) backed by kuromoji.js (IPADIC).
 *
 * Produces surface / lemma (base form) / reading (hiragana) / pos. `wordEntryId`
 * is left null here — dictionary resolution is a separate step (see
 * `resolveWordEntries` / `analyzeLine`) so the tokenizer stays DB-free.
 *
 * Upgrade path (ARQUITETURA §7): swap this adapter for a SudachiPy microservice
 * behind the same `Tokenizer` interface.
 */
export class JaTokenizer implements Tokenizer {
  readonly language = "ja";

  async tokenize(text: string): Promise<Token[]> {
    if (text.trim().length === 0) return [];
    const tokenizer = await buildKuromoji();
    return tokenizer.tokenize(text).map((f) => ({
      surface: f.surface_form,
      lemma: notEmpty(f.basic_form) ? f.basic_form : f.surface_form,
      reading: notEmpty(f.reading) ? kataToHira(f.reading) : "",
      pos: notEmpty(f.pos) ? f.pos : "unknown",
      wordEntryId: null,
    }));
  }
}
