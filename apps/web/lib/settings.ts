// Settings persistence (T1.8). BYOK key + explanation language + provider.
// parseSettingsInput is pure and unit-tested; updateSettings does the DB write.

import { eq } from "drizzle-orm";
import { type Database, type DailyGoals, userSettings } from "@fuchine/db";
import { encryptApiKey } from "@fuchine/llm";

export type Result = { status: number; body: Record<string, unknown> };

export const ALLOWED_PROVIDERS = ["minimax", "openai", "anthropic", "gemini", "openai-compatible", "local"] as const;
export const ALLOWED_LANGUAGES = ["en", "ja", "pt", "es", "zh", "ko"] as const;

// Per-day goal ceilings: anything above is a typo, not ambition.
const GOAL_LIMITS: Record<keyof DailyGoals, number> = {
  newCardsPerDay: 500,
  reviewMinutesPerDay: 1440,
  watchMinutesPerDay: 1440,
};

export type ParsedSettings = {
  llmProvider?: (typeof ALLOWED_PROVIDERS)[number];
  explanationLanguage?: (typeof ALLOWED_LANGUAGES)[number];
  dailyGoals?: DailyGoals | null; // null clears; undefined leaves untouched
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
    value.llmProvider = b.llmProvider as (typeof ALLOWED_PROVIDERS)[number];
  }

  if (b.explanationLanguage !== undefined) {
    if (!ALLOWED_LANGUAGES.includes(b.explanationLanguage as (typeof ALLOWED_LANGUAGES)[number])) {
      return { ok: false, error: `unknown explanation language: ${String(b.explanationLanguage)}` };
    }
    value.explanationLanguage = b.explanationLanguage as (typeof ALLOWED_LANGUAGES)[number];
  }

  if (b.dailyGoals !== undefined) {
    if (b.dailyGoals === null) {
      value.dailyGoals = null;
    } else if (typeof b.dailyGoals !== "object" || Array.isArray(b.dailyGoals)) {
      return { ok: false, error: "dailyGoals must be an object or null" };
    } else {
      const raw = b.dailyGoals as Record<string, unknown>;
      const goals: DailyGoals = {};
      for (const key of Object.keys(GOAL_LIMITS) as (keyof DailyGoals)[]) {
        const v = raw[key];
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > GOAL_LIMITS[key]) {
          return { ok: false, error: `${key} must be an integer between 1 and ${GOAL_LIMITS[key]}` };
        }
        goals[key] = v;
      }
      value.dailyGoals = goals;
    }
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
  if (v.dailyGoals !== undefined) {
    if (v.dailyGoals === null) {
      set.dailyGoals = null;
    } else {
      // Partial update: merge over the stored goals so one field can't wipe the rest.
      const [current] = await db
        .select({ dailyGoals: userSettings.dailyGoals })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
      set.dailyGoals = { ...current?.dailyGoals, ...v.dailyGoals };
    }
  }

  if (v.keyAction === "set") {
    if (!encryptionKey) {
      return { status: 500, body: { error: "encryption key not configured" } };
    }
    set.apiKeyEnc = encryptApiKey(v.apiKey!, encryptionKey);
  } else if (v.keyAction === "remove") {
    set.apiKeyEnc = null;
  }

  if (Object.keys(set).length > 0) {
    await db
      .insert(userSettings)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: userSettings.userId, set });
  }

  const [row] = await db
    .select({
      llmProvider: userSettings.llmProvider,
      explanationLanguage: userSettings.explanationLanguage,
      apiKeyEnc: userSettings.apiKeyEnc,
      dailyGoals: userSettings.dailyGoals,
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
      dailyGoals: row?.dailyGoals ?? null,
    },
  };
}

/** Mark onboarding as complete for the given user. */
export async function completeOnboarding(db: Database, userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(userSettings)
    .values({ userId, onboardingCompletedAt: now })
    .onConflictDoUpdate({ target: userSettings.userId, set: { onboardingCompletedAt: now } });
}

/** Return true when the user has completed onboarding. */
export async function isOnboardingDone(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ onboardingCompletedAt: userSettings.onboardingCompletedAt })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return !!row?.onboardingCompletedAt;
}
