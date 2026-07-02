// The self-host "house" LLM provider, built from env (same vars as the worker).
// Used for layer-1 translation and as the layer-2 fallback when a user has no
// BYOK key. Returns the "echo" provider when nothing is configured (which means
// translation yields null and explanation throws — degrade, don't break).

import {
  createProvider,
  FallbackProvider,
  type LlmProvider,
  type ProviderName,
} from "@fuchine/llm";

export function houseProvider(): LlmProvider {
  return createProvider({
    provider: (process.env.LLM_PROVIDER ?? "echo") as ProviderName,
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    model: process.env.LLM_MODEL || undefined,
  });
}

/**
 * Layer-1 MT provider: a fast translation-only backend (DeepL recommended)
 * with the house LLM as automatic fallback on any provider failure. Without
 * MT_PROVIDER this is exactly houseProvider() — no behavior change.
 */
export function houseMtProvider(): LlmProvider {
  const mt = process.env.MT_PROVIDER as ProviderName | undefined;
  if (!mt) return houseProvider();
  return new FallbackProvider(
    createProvider({
      provider: mt,
      apiKey: process.env.MT_API_KEY,
      baseUrl: process.env.MT_BASE_URL || undefined,
    }),
    houseProvider(),
  );
}
