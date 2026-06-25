import type { IpadicFeatures, Tokenizer as KuromojiTokenizer } from "kuromoji";
import type { Token, Tokenizer } from "../interfaces";
import { kataToHira, hiraToRomaji } from "./kana";

// kuromoji (and its IPADIC) is loaded lazily on first tokenize() so that merely
// importing this module (e.g. via getDictionary in the web app) never pulls the
// dictionary into the bundle. Only the worker actually tokenizes.
let buildPromise: Promise<KuromojiTokenizer<IpadicFeatures>> | null = null;

async function buildKuromoji(): Promise<KuromojiTokenizer<IpadicFeatures>> {
  if (!buildPromise) {
    buildPromise = (async () => {
      /* webpackIgnore: true */ const { createRequire } = await import("module");
      /* webpackIgnore: true */ const { dirname, join } = await import("path");
      const kuromoji = (await import("kuromoji")).default;
      const req = createRequire(import.meta.url);
      const dicPath = join(dirname(req.resolve("kuromoji/package.json")), "dict");
      return new Promise<KuromojiTokenizer<IpadicFeatures>>((resolve, reject) => {
        kuromoji.builder({ dicPath }).build((err, tokenizer) => {
          if (err) reject(err);
          else if (!tokenizer) reject(new Error("kuromoji returned no tokenizer"));
          else resolve(tokenizer);
        });
      });
    })();
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
    return tokenizer.tokenize(text).map((f) => {
      const reading = notEmpty(f.reading) ? kataToHira(f.reading) : "";
      const romaji = reading ? hiraToRomaji(reading) : "";
      return {
        surface: f.surface_form,
        lemma: notEmpty(f.basic_form) ? f.basic_form : f.surface_form,
        reading,
        romaji,
        pos: notEmpty(f.pos) ? f.pos : "unknown",
        wordEntryId: null,
      };
    });
  }
}
