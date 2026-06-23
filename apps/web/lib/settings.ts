// Settings persistence (T1.8). BYOK key + explanation language + provider.
// parseSettingsInput is pure and unit-tested; updateSettings does the DB write.

import { eq } from "drizzle-orm";
import { type Database, userSettings } from "@fuchine/db";
import { encryptApiKey } from "@fuchine/llm";

export type Result = { status: number; body: Record<string, unknown> };

export const ALLOWED_PROVIDERS = ["minimax", "openai"] as const;
export const ALLOWED_LANGUAGES = ["en", "ja"] as const;

export type ParsedSettings = {
  llmProvider?: string;
  explanationLanguage?: string;
  keyAction: "set" | "remove" | "keep";
  apiKey?: string; // present iff keyAction === "set"
};

export type ParseResult =
  | { ok: true; value: ParsedSettings }
  | { ok: false; error: string };

/** Validate + normalize a PATCH body. Pure: no DB, no crypto. */
export function parseSettingsInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const value: ParsedSettings = { keyAction: "keep" };

  if (b.llmProvider !== undefined) {
    if (!ALLOWED_PROVIDERS.includes(b.llmProvider as (typeof ALLOWED_PROVIDERS)[number])) {
      return { ok: false, error: `unknown provider: ${String(b.llmProvider)}` };
    }
    value.llmProvider = b.llmProvider as string;
  }

  if (b.explanationLanguage !== undefined) {
    if (!ALLOWED_LANGUAGES.includes(b.explanationLanguage as (typeof ALLOWED_LANGUAGES)[number])) {
      return { ok: false, error: `unknown explanation language: ${String(b.explanationLanguage)}` };
    }
    value.explanationLanguage = b.explanationLanguage as string;
  }

  if (b.removeKey === true) {
    value.keyAction = "remove";
  } else if (typeof b.apiKey === "string" && b.apiKey.trim().length > 0) {
    value.keyAction = "set";
    value.apiKey = b.apiKey;
  }

  return { ok: true, value };
}

/** Persist provided settings for a user. Returns the safe public view. */
export async function updateSettings(
  db: Database,
  userId: string,
  body: unknown,
  encryptionKey: string | undefined,
): Promise<Result> {
  const parsed = parseSettingsInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const v = parsed.value;

  const set: Partial<typeof userSettings.$inferInsert> = {};
  if (v.llmProvider !== undefined) set.llmProvider = v.llmProvider;
  if (v.explanationLanguage !== undefined) set.explanationLanguage = v.explanationLanguage;

  if (v.keyAction === "set") {
    if (!encryptionKey) {
      return { status: 500, body: { error: "encryption key not configured" } };
    }
    set.apiKeyEnc = encryptApiKey(v.apiKey!, encryptionKey);
  } else if (v.keyAction === "remove") {
    set.apiKeyEnc = null;
  }

  if (Object.keys(set).length > 0) {
    await db.update(userSettings).set(set).where(eq(userSettings.userId, userId));
  }

  const [row] = await db
    .select({
      llmProvider: userSettings.llmProvider,
      explanationLanguage: userSettings.explanationLanguage,
      apiKeyEnc: userSettings.apiKeyEnc,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return {
    status: 200,
    body: {
      llmProvider: row?.llmProvider ?? null,
      explanationLanguage: row?.explanationLanguage ?? "en",
      hasApiKey: !!row?.apiKeyEnc,
    },
  };
}
