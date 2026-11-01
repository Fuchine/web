// Auth.js glue for registration control (T2.3). Two hook points:
//   - registrationSignIn: the `signIn` callback body. Runs before any account
//     exists (OAuth callback; magic-link *send* step and link callback). Gathers
//     the policy inputs and denies without revealing why.
//   - withInviteCreateUser: wraps the adapter's createUser so a new account is
//     created, its invite consumed and its settings provisioned in ONE
//     transaction (a concurrently consumed invite aborts the creation).
// Kept out of auth.ts so it is testable against a real DB without NextAuth.

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { NextAuthConfig } from "next-auth";
import {
  consumeInvite,
  ensureUserSettings,
  findActiveInvite,
  normalizeEmail,
  users,
  type Database,
} from "@fuchine/db";
import { decideRegistration, type RegistrationEnv } from "./registration";

type SignInParams = Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["signIn"]>>[0];

/** Where Auth.js sends a successful magic-link request; reused on deny so the two look identical. */
export const VERIFY_REQUEST_PATH = "/api/auth/verify-request?provider=nodemailer&type=email";

function emailTag(email: string | null): string {
  return email ? createHash("sha256").update(email).digest("hex").slice(0, 12) : "none";
}

async function isExistingUser(db: Database, email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  return rows.length > 0;
}

export async function registrationSignIn(
  db: Database,
  params: SignInParams,
  env: RegistrationEnv,
): Promise<boolean | string> {
  if (!env.ok) return false; // boot fails on this in production; be safe anyway
  const email = normalizeEmail(params.user?.email);
  const emailVerified =
    params.account?.provider === "google"
      ? (params.profile as { email_verified?: unknown } | undefined)?.email_verified === true
      : true; // magic link: receiving the link is the proof

  // Don't trust user.id: for an unknown e-mail Auth.js passes a random uuid.
  const existing = email && env.mode !== "open" ? await isExistingUser(db, email) : false;
  const needsInvite =
    email && env.mode === "invite" && !existing &&
    !env.allowEmails.includes(email) &&
    !env.allowDomains.includes(email.slice(email.lastIndexOf("@") + 1));
  const hasActiveInvite = needsInvite ? !!(await findActiveInvite(db, email)) : false;

  const decision = decideRegistration({
    mode: env.mode,
    email,
    emailVerified,
    isExistingUser: existing,
    hasActiveInvite,
    allowEmails: env.allowEmails,
    allowDomains: env.allowDomains,
  });
  if (decision.allow) return true;

  // Log the reason with a hash, never the address.
  console.warn(`[auth] registration denied: ${decision.reason} ${emailTag(email)}`);
  // Magic-link send step: answer exactly like a successful request, send nothing.
  if (params.email?.verificationRequest) return VERIFY_REQUEST_PATH;
  return false;
}

export function withInviteCreateUser(
  adapter: Adapter,
  db: Database,
  getEnv: () => RegistrationEnv,
): Adapter {
  return {
    ...adapter,
    async createUser(data: AdapterUser): Promise<AdapterUser> {
      const env = getEnv();
      const email = normalizeEmail(data.email);
      if (!env.ok || !email) throw new Error("registration: invalid configuration or e-mail");

      return db.transaction(async (tx) => {
        // Re-check inside the transaction: the signIn callback ran earlier and
        // an invite may have been used or revoked since. Verification was
        // enforced there; here the account is new by definition.
        const decision = decideRegistration({
          mode: env.mode,
          email,
          emailVerified: true,
          isExistingUser: false,
          hasActiveInvite: env.mode === "invite" ? !!(await findActiveInvite(tx, email)) : false,
          allowEmails: env.allowEmails,
          allowDomains: env.allowDomains,
        });
        if (!decision.allow) throw new Error(`registration denied: ${decision.reason}`);

        const [row] = await tx
          .insert(users)
          .values({
            email,
            name: data.name ?? null,
            image: data.image ?? null,
            emailVerified: data.emailVerified ?? null,
          })
          .returning();
        if (!row) throw new Error("registration: user insert returned nothing");

        // Row-locking UPDATE: a concurrent sign-up with the same invite waits,
        // then matches zero rows and rolls back its own user insert.
        if (decision.via === "invite" && !(await consumeInvite(tx, email, row.id))) {
          throw new Error("registration denied: invite no longer valid");
        }
        await ensureUserSettings(tx, row.id);
        return row as AdapterUser;
      });
    },
  };
}
