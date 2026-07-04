// House LLM provider for background jobs, built from the same env vars the
// web app's house provider uses. Pre-warm is skipped entirely when no real
// provider is configured — "echo" would just fail every line.

import { createProvider, type LlmProvider, type ProviderName } from "@fuchine/llm";

export function hasHouseLlm(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LLM_PROVIDER ?? "echo") !== "echo";
}

export function houseProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  return createProvider({
    provider: (env.LLM_PROVIDER ?? "echo") as ProviderName,
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL || undefined,
    model: env.LLM_MODEL || undefined,
  });
}
