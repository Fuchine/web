// The self-host "house" LLM provider, built from env (same vars as the worker).
// Used for layer-1 translation and as the layer-2 fallback when a user has no
// BYOK key. Returns the "echo" provider when nothing is configured (which means
// translation yields null and explanation throws — degrade, don't break).

import { createProvider, type LlmProvider, type ProviderName } from "@fuchine/llm";

export function houseProvider(): LlmProvider {
  return createProvider({
    provider: (process.env.LLM_PROVIDER ?? "echo") as ProviderName,
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    model: process.env.LLM_MODEL || undefined,
  });
}
