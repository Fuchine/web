import type { LlmProvider } from "../contract";
import { EchoProvider } from "./echo";

export { EchoProvider } from "./echo";

export type ProviderName = "anthropic" | "openai" | "gemini" | "ollama" | "echo";

export type ProviderConfig = {
  provider: ProviderName;
  apiKey?: string; // resolved (decrypted) key; absent for echo/ollama-local
  model?: string;
};

/**
 * Build an LlmProvider from config (D5). The real adapters land per provider;
 * until then everything falls back to the echo provider so the app runs.
 */
export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.provider) {
    case "echo":
      return new EchoProvider();
    case "anthropic":
    case "openai":
    case "gemini":
    case "ollama":
      // TODO(llm): implement adapters. translateBatch must guarantee 1:1
      // alignment; explainLine must return the Explanation shape verbatim.
      throw new Error(`Provider "${config.provider}" is not implemented yet`);
    default:
      throw new Error(`Unknown provider "${String(config.provider)}"`);
  }
}
