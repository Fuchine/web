import { eq } from "drizzle-orm";
import { users, type DbOrTx } from "@fuchine/db";

/** Case- and whitespace-insensitive equality; a blank email never matches. */
export function confirmationMatches(confirm: string, email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.length > 0 && confirm.trim().toLowerCase() === e;
}

/**
 * Permanently delete a user. The schema's onDelete:"cascade" FKs from users.id
 * remove every per-user row (settings, sessions, cards, review_logs, albums,
 * stats, saved words). Videos/subtitles are shared content (D3) and stay.
 * The caller MUST pass the server session's own id + email as the target.
 */
export async function deleteAccount(
  db: DbOrTx,
  userId: string,
  confirm: string,
  userEmail: string,
): Promise<{ status: number; body: unknown }> {
  if (!confirmationMatches(confirm, userEmail)) {
    return { status: 400, body: { error: "confirmation does not match" } };
  }
  await db.delete(users).where(eq(users.id, userId));
  return { status: 200, body: { deleted: true } };
}
