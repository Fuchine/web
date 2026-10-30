// Invite data layer (T2.3). Shared by the web app (registration checks and the
// consuming createUser) and the worker (operator CLI).

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { invites, type Invite } from "./schema";

const active = (email: string) =>
  and(eq(invites.email, email), isNull(invites.usedAt), gt(invites.expiresAt, sql`now()`));

/** The unused, unexpired invite for this (normalized) address, or null. */
export async function findActiveInvite(db: DbOrTx, email: string): Promise<Invite | null> {
  const [row] = await db.select().from(invites).where(active(email)).limit(1);
  return row ?? null;
}

/**
 * Atomically mark the active invite for `email` as used by `userId`. Returns
 * false when there is none (expired, revoked, or consumed concurrently) — the
 * caller must then refuse to create the account.
 */
export async function consumeInvite(tx: DbOrTx, email: string, userId: string): Promise<boolean> {
  const rows = await tx
    .update(invites)
    .set({ usedAt: sql`now()`, usedBy: userId })
    .where(active(email))
    .returning({ id: invites.id });
  return rows.length > 0;
}

/**
 * Create the active invite for `email`, or refresh its expiry/note if one is
 * already pending. An expired-but-unused row is replaced (same partial index).
 */
export async function addInvite(
  db: DbOrTx,
  opts: { email: string; days: number; note?: string | null; createdBy: string },
): Promise<Invite> {
  const expiresAt = new Date(Date.now() + opts.days * 86_400_000);
  const [row] = await db
    .insert(invites)
    .values({ email: opts.email, expiresAt, note: opts.note ?? null, createdBy: opts.createdBy })
    .onConflictDoUpdate({
      target: invites.email,
      targetWhere: sql`${invites.usedAt} is null`,
      set: { expiresAt, note: opts.note ?? null, createdBy: opts.createdBy, createdAt: sql`now()` },
    })
    .returning();
  return row!;
}

/** Invites newest first; only active ones unless `all`. */
export async function listInvites(db: DbOrTx, opts: { all?: boolean } = {}): Promise<Invite[]> {
  return db
    .select()
    .from(invites)
    .where(opts.all ? undefined : and(isNull(invites.usedAt), gt(invites.expiresAt, sql`now()`)))
    .orderBy(desc(invites.createdAt));
}

/** Delete the unused invite for `email` (expired or not). Returns rows removed. */
export async function revokeInvite(db: DbOrTx, email: string): Promise<number> {
  const rows = await db
    .delete(invites)
    .where(and(eq(invites.email, email), isNull(invites.usedAt)))
    .returning({ id: invites.id });
  return rows.length;
}
