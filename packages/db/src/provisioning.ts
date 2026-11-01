// New-user provisioning. Called inside account creation (apps/web/lib/auth-registration.ts) so every
// account starts with a settings row (defaults come from the column defaults:
// learning_language = ja, explanation_language = en).

import type { DbOrTx } from "./client";
import { userSettings } from "./schema";

/** Ensure a user has a settings row. Idempotent (PK is user_id). */
export async function ensureUserSettings(
  db: DbOrTx,
  userId: string,
): Promise<void> {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
}
