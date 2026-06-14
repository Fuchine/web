// BYOK key resolution (CONTRATO_IA §6.2). In self-host, the user's key lives
// in user_settings as AES-GCM ciphertext; decrypt it and build their provider.

import { eq } from "drizzle-orm";
import { userSettings, type Database } from "@fuchine/db";
import type { LlmProvider } from "./contract";
import { decryptApiKey } from "./crypto";
import { MissingApiKeyError } from "./errors";
import { createProvider, type ProviderName } from "./providers";

/**
 * Resolve the LLM provider configured by a user (self-host BYOK). Throws
 * MissingApiKeyError when no provider/key is set — layer 0 keeps working.
 */
export async function resolveUserProvider(
  db: Database,
  userId: string,
  encryptionKey: string,
  overrides?: { baseUrl?: string; model?: string },
): Promise<LlmProvider> {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings?.llmProvider) {
    throw new MissingApiKeyError("No LLM provider configured");
  }
  if (!settings.apiKeyEnc) {
    throw new MissingApiKeyError("No API key configured");
  }

  const apiKey = decryptApiKey(settings.apiKeyEnc, encryptionKey);
  return createProvider({
    provider: settings.llmProvider as ProviderName,
    apiKey,
    baseUrl: overrides?.baseUrl,
    model: overrides?.model,
  });
}
