// DeepL provider (layer 1 only). DeepL is NOT OpenAI-compatible: it has its own
// /v2/translate endpoint, auth header, batch-of-texts shape and language codes.
// It's pure MT — it never returns null for SFX/music, so this adapter enforces
// the CONTRATO §3.2 null contract itself (skip blank/♪ lines, map results back).
// Layer 2 (explainLine) is not available: DeepL only translates.

import type { Explanation } from "@fuchine/db";
import type { LlmProvider, SubtitleLineCtx } from "../contract";
import { ProviderError, RateLimitError } from "../errors";
import { logLlmUsage } from "../usage";

export type DeepLConfig = {
  apiKey: string;
  baseUrl?: string; // override; default inferred from the key (":fx" = Free)
};

// DeepL caps a single request at 50 texts.
const BATCH = 50;

/** A line worth sending to DeepL: non-blank and not a music/SFX cue. */
function isTranslatable(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("♪");
}

function srcLang(code: string): string {
  const m: Record<string, string> = { ja: "JA", en: "EN", pt: "PT", es: "ES" };
  return m[code] ?? code.toUpperCase();
}

function tgtLang(code: string): string {
  // DeepL requires a regional variant for English/Portuguese targets.
  const m: Record<string, string> = { en: "EN-US", pt: "PT-BR", ja: "JA", es: "ES" };
  return m[code] ?? code.toUpperCase();
}

export class DeepLProvider implements LlmProvider {
  readonly name = "deepl";
  private readonly apiKey: string;
  private readonly host: string;

  constructor(config: DeepLConfig) {
    this.apiKey = config.apiKey;
    this.host =
      config.baseUrl?.replace(/\/+$/, "") ??
      (config.apiKey.trim().endsWith(":fx")
        ? "https://api-free.deepl.com"
        : "https://api.deepl.com");
  }

  async translateBatch(
    lines: string[],
    opts: { from: string; to: string },
  ): Promise<(string | null)[]> {
    const out: (string | null)[] = new Array(lines.length).fill(null);

    // Send only translatable lines; remember their original positions.
    const idxs: number[] = [];
    const texts: string[] = [];
    lines.forEach((line, i) => {
      if (isTranslatable(line)) {
        idxs.push(i);
        texts.push(line);
      }
    });

    for (let i = 0; i < texts.length; i += BATCH) {
      const chunk = texts.slice(i, i + BATCH);
      const translated = await this.call(chunk, opts.from, opts.to);
      for (let j = 0; j < chunk.length; j++) out[idxs[i + j]!] = translated[j] ?? null;
    }
    return out;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async explainLine(
    _ctx: SubtitleLineCtx,
    _opts: { explanationLanguage: string },
  ): Promise<Explanation> {
    throw new ProviderError(
      "DeepLProvider only translates (layer 1). Configure an LLM for explanations.",
    );
  }

  /** One DeepL /v2/translate call → same-length array, aligned by construction. */
  private async call(texts: string[], from: string, to: string): Promise<(string | null)[]> {
    const chars = texts.reduce((sum, t) => sum + t.length, 0);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.host}/v2/translate`, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: texts,
          source_lang: srcLang(from),
          target_lang: tgtLang(to),
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      logLlmUsage({ fn: "translateBatch", provider: "deepl" }, { chars, ms: Date.now() - t0, ok: false });
      throw new ProviderError(`Network error: ${(err as Error).message}`);
    }

    // 429 = too many requests, 456 = quota exceeded — both retryable upstream.
    if (res.status === 429 || res.status === 456) {
      logLlmUsage({ fn: "translateBatch", provider: "deepl" }, { chars, ms: Date.now() - t0, ok: false });
      throw new RateLimitError("DeepL rate/quota limited");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logLlmUsage({ fn: "translateBatch", provider: "deepl" }, { chars, ms: Date.now() - t0, ok: false });
      throw new ProviderError(`DeepL error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as { translations?: { text?: string }[] };
    const arr = data.translations ?? [];
    logLlmUsage({ fn: "translateBatch", provider: "deepl" }, { chars, ms: Date.now() - t0, ok: true });
    return texts.map((_, i) => {
      const t = arr[i]?.text;
      return typeof t === "string" && t.trim().length > 0 ? t : null;
    });
  }
}
