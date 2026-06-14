import type { Explanation } from "@fuchine/db";
import type { LlmProvider, SubtitleLineCtx } from "../contract";
import { ProviderError } from "../errors";

/**
 * Dev/no-key provider. Lets the import pipeline run end-to-end without any
 * LLM credentials: translations come back null (video stays JP-only, which is
 * still studyable — CONTRATO §3.5), and explanations are not available.
 */
export class EchoProvider implements LlmProvider {
  readonly name = "echo";

  // eslint-disable-next-line @typescript-eslint/require-await
  async translateBatch(
    lines: string[],
    _opts: { from: string; to: string },
  ): Promise<(string | null)[]> {
    // Contract: same length, same order (CONTRATO §3.2).
    return lines.map(() => null);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async explainLine(
    _ctx: SubtitleLineCtx,
    _opts: { explanationLanguage: string },
  ): Promise<Explanation> {
    throw new ProviderError(
      "EchoProvider cannot explain lines. Configure a real LLM provider (BYOK).",
    );
  }
}
