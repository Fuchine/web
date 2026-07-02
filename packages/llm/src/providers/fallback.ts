// Composition provider: try the primary for MT, fall back to the secondary on
// any LlmError (rate limit, quota, provider down, bad key). Explanations go
// straight to the fallback — the primary may be MT-only (DeepL). Rationale:
// "AI failure degrades, never breaks" (CONTRATO §7) — a misconfigured or
// exhausted primary must never mute the app; the warn keeps it visible.

import type { Explanation } from "@fuchine/db";
import type { LlmProvider, SubtitleLineCtx } from "../contract";
import { LlmError } from "../errors";

export class FallbackProvider implements LlmProvider {
  readonly name: string;

  constructor(
    private readonly primary: LlmProvider & { name?: string },
    private readonly fallback: LlmProvider & { name?: string },
  ) {
    this.name = `fallback(${primary.name ?? "primary"}→${fallback.name ?? "fallback"})`;
  }

  async translateBatch(
    lines: string[],
    opts: { from: string; to: string },
  ): Promise<(string | null)[]> {
    try {
      return await this.primary.translateBatch(lines, opts);
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      console.warn(
        `[llm] ${this.primary.name ?? "primary"} failed (${err.name}: ${err.message}); falling back to ${this.fallback.name ?? "fallback"}`,
      );
      return this.fallback.translateBatch(lines, opts);
    }
  }

  explainLine(
    ctx: SubtitleLineCtx,
    opts: { explanationLanguage: string },
  ): Promise<Explanation> {
    return this.fallback.explainLine(ctx, opts);
  }
}
