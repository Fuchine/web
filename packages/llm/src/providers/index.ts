import type { LlmProvider } from "../contract";
import { MissingApiKeyError } from "../errors";
import { EchoProvider } from "./echo";
import { DeepLProvider } from "./deepl";
import { OpenAICompatibleProvider } from "./openai-compatible";

export { EchoProvider } from "./echo";
export { DeepLProvider, type DeepLConfig } from "./deepl";
export {
  OpenAICompatibleProvider,
  type OpenAICompatibleConfig,
  type ChatFn,
} from "./openai-compatible";
export { FallbackProvider } from "./fallback";

export type ProviderName =
  | "minimax"
  | "openai"
  | "openai-compatible"
  | "deepl"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "echo";

export type ProviderConfig = {
  provider: ProviderName;
  apiKey?: string; // resolved (decrypted) key
  baseUrl?: string; // override the default endpoint
  model?: string; // override the default model
  jsonMode?: boolean;
};

// Defaults per OpenAI-compatible backend. baseUrl/model are overridable.
const DEFAULTS = {
  minimax: { baseUrl: "https://api.minimax.io/v1", model: "minimax-m3" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
} as const;

function requireKey(config: ProviderConfig): string {
  if (!config.apiKey) {
    throw new MissingApiKeyError(`Provider "${config.provider}" requires an API key`);
  }
  return config.apiKey;
}

/**
 * Build an LlmProvider from config (D5). OpenAI-compatible backends share one
 * adapter; echo runs without a key for dev. Native-format providers
 * (anthropic, gemini) are not implemented yet.
 */
export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.provider) {
    case "echo":
      return new EchoProvider();

    case "minimax":
    case "openai": {
      const d = config.provider === "minimax" ? DEFAULTS.minimax : DEFAULTS.openai;
      return new OpenAICompatibleProvider({
        baseUrl: config.baseUrl ?? d.baseUrl,
        model: config.model ?? d.model,
        apiKey: requireKey(config),
        jsonMode: config.jsonMode,
      });
    }

    case "openai-compatible": {
      if (!config.baseUrl || !config.model) {
        throw new Error(
          'Provider "openai-compatible" requires baseUrl and model',
        );
      }
      return new OpenAICompatibleProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: requireKey(config),
        jsonMode: config.jsonMode,
      });
    }

    case "deepl":
      // Layer-1 MT only; explainLine throws. baseUrl inferred from the key.
      return new DeepLProvider({ apiKey: requireKey(config), baseUrl: config.baseUrl });

    case "anthropic":
    case "gemini":
    case "ollama":
      // TODO(llm): native wire formats. Until then use "openai-compatible"
      // with the appropriate gateway, or add a dedicated adapter.
      throw new Error(`Provider "${config.provider}" is not implemented yet`);

    default:
      throw new Error(`Unknown provider "${String(config.provider)}"`);
  }
}
