// Instance administrators (T3.4; the admin area of T2.13 builds on this).
//
// ADMIN_EMAILS is a comma-separated list of e-mail addresses (normalized the
// same way as sign-in). Unset or empty = nobody is an admin: admin-only
// features (today: uploading and managing imported dictionaries) stay off,
// and operators use the CLI instead.

import { normalizeEmail } from "@fuchine/db";

export function adminEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter((e): e is string => !!e),
  );
}

export function isAdminEmail(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const e = normalizeEmail(email ?? "");
  return !!e && adminEmails(env).has(e);
}

/**
 * Gate for admin routes: 401 without a session, 403 for a signed-in
 * non-admin, null when the caller is an admin.
 */
export function adminDenial(
  session: { user?: { id?: string | null; email?: string | null } | null } | null,
): { status: 401 | 403; error: string } | null {
  if (!session?.user?.id) return { status: 401, error: "unauthorized" };
  if (!isAdminEmail(session.user.email)) return { status: 403, error: "Only instance admins can do this." };
  return null;
}
