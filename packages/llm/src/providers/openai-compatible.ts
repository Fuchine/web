// OpenAI-compatible chat provider. Drives any backend that speaks the
// /chat/completions API — MiniMax (api.minimax.io/v1, model "minimax-m3"),
// OpenAI, local vLLM/Ollama-OpenAI, etc. Provider choice is configuration (D5).

import type { Explanation, JlptLevel, LlmProvider, SubtitleLineCtx } from "../contract";
import { ProviderError, RateLimitError } from "../errors";
import {
  buildExplainMessages,
  buildTranslateMessages,
  buildTranslateOneMessages,
  type ChatMessage,
} from "../prompts";

/** A single call to the chat model. Injectable so the contract is testable. */
export type ChatFn = (
  messages: ChatMessage[],
  opts?: { temperature?: number; jsonMode?: boolean },
) => Promise<string>;

export type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode?: boolean; // default true (json_object response mode)
  chat?: ChatFn; // override the HTTP call (tests)
};

const TRANSLATE_CHUNK = 40;
const JLPT_LEVELS: readonly string[] = ["N5", "N4", "N3", "N2", "N1"];
const MAX_GRAMMAR_POINTS = 4;

export class OpenAICompatibleProvider implements LlmProvider {
  private readonly chat: ChatFn;

  constructor(config: OpenAICompatibleConfig) {
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.chat =
      config.chat ??
      defaultChat({ ...config, baseUrl, jsonMode: config.jsonMode ?? true });
  }

  async translateBatch(
    lines: string[],
    opts: { from: string; to: string },
  ): Promise<(string | null)[]> {
    const out: (string | null)[] = new Array(lines.length).fill(null);
    for (let i = 0; i < lines.length; i += TRANSLATE_CHUNK) {
      const chunk = lines.slice(i, i + TRANSLATE_CHUNK);
      const translated = await this.translateChunk(chunk, opts.from, opts.to);
      for (let j = 0; j < chunk.length; j++) out[i + j] = translated[j] ?? null;
    }
    return out;
  }

  async explainLine(
    ctx: SubtitleLineCtx,
    opts: { explanationLanguage: string },
  ): Promise<Explanation> {
    const content = await this.chat(
      buildExplainMessages(ctx, opts.explanationLanguage),
      { temperature: 0.2, jsonMode: true },
    );
    return coerceExplanation(extractJson(content));
  }

  /** Translate one chunk, guaranteeing a same-length array (CONTRATO §3.2). */
  private async translateChunk(
    chunk: string[],
    from: string,
    to: string,
  ): Promise<(string | null)[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const parsed = await this.tryTranslateChunk(chunk, from, to);
      if (parsed && parsed.length === chunk.length) return parsed;
    }
    // Persistent misalignment: fall back to line-by-line (aligned by construction).
    return Promise.all(chunk.map((line) => this.translateOne(line, from, to)));
  }

  private async tryTranslateChunk(
    chunk: string[],
    from: string,
    to: string,
  ): Promise<(string | null)[] | null> {
    try {
      const content = await this.chat(
        buildTranslateMessages(chunk, from, to),
        { temperature: 0.2, jsonMode: true },
      );
      const raw = extractJson(content);
      const arr = (raw as { translations?: unknown }).translations;
      if (!Array.isArray(arr)) return null;
      return arr.map(normalizeTranslation);
    } catch {
      return null;
    }
  }

  private async translateOne(
    line: string,
    from: string,
    to: string,
  ): Promise<string | null> {
    try {
      const content = await this.chat(
        buildTranslateOneMessages(line, from, to),
        { temperature: 0.2, jsonMode: true },
      );
      const raw = extractJson(content);
      return normalizeTranslation((raw as { translation?: unknown }).translation);
    } catch {
      return null;
    }
  }
}

/* ---------------------------- helpers ---------------------------- */

function defaultChat(config: Required<Omit<OpenAICompatibleConfig, "chat">>): ChatFn {
  return async (messages, opts) => {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: opts?.temperature ?? 0.3,
    };
    if (opts?.jsonMode ?? config.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    let res: Response;
    try {
      res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(`Network error: ${(err as Error).message}`);
    }

    if (res.status === 429) throw new RateLimitError("Provider rate limited");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ProviderError(`Provider error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new ProviderError("Provider returned no content");
    }
    return content;
  };
}

function normalizeTranslation(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/** Parse JSON from a model response, tolerating code fences and stray prose. */
export function extractJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.search(/[{[]/);
    const end = Math.max(stripped.lastIndexOf("}"), stripped.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ProviderError("Model did not return valid JSON");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function coerceLevel(value: unknown): JlptLevel | null {
  return typeof value === "string" && JLPT_LEVELS.includes(value)
    ? (value as JlptLevel)
    : null;
}

/** Coerce an arbitrary parsed object into a valid Explanation (CONTRATO §4.4). */
export function coerceExplanation(raw: unknown): Explanation {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const points = Array.isArray(obj.grammarPoints) ? obj.grammarPoints : [];
  const grammarPoints = points
    .slice(0, MAX_GRAMMAR_POINTS)
    .map((p) => {
      const g = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
      return {
        pattern: asString(g.pattern),
        level: coerceLevel(g.level),
        explanation: asString(g.explanation),
      };
    })
    .filter((g) => g.pattern.length > 0 || g.explanation.length > 0);

  const nuance =
    typeof obj.nuance === "string" && obj.nuance.trim().length > 0
      ? obj.nuance
      : null;

  return { summary: asString(obj.summary), grammarPoints, nuance };
}
