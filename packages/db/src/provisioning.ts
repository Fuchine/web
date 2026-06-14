// New-user provisioning. Called from the Auth.js `createUser` event so every
// account starts with a settings row (defaults come from the column defaults:
// learning_language = ja, explanation_language = en).

import type { Database } from "./client";
import { userSettings } from "./schema";

/** Ensure a user has a settings row. Idempotent (PK is user_id). */
export async function ensureUserSettings(
  db: Database,
  userId: string,
): Promise<void> {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
}
