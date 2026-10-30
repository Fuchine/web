/**
 * End-to-end test for registration control (T2.3). Runs the REAL signIn
 * callback body and the invite-consuming createUser against a live Postgres:
 * denials create no user, invites are single use / expiring / revocable,
 * closed mode keeps existing users, magic-link denial looks like success.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-registration.ts
 */
import { eq, like, sql } from "drizzle-orm";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import {
  addInvite, createDb, invites, revokeInvite, userSettings, users,
  type Database,
} from "@fuchine/db";
import {
  registrationSignIn, withInviteCreateUser, VERIFY_REQUEST_PATH,
} from "../lib/auth-registration";
import type { RegistrationEnv, RegistrationMode } from "../lib/registration";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

const DOMAIN = "e2e-reg.example.test";
const addr = (local: string) => `${local}@${DOMAIN}`;
const env = (mode: RegistrationMode, over: Partial<{ allowEmails: string[]; allowDomains: string[] }> = {}): RegistrationEnv =>
  ({ ok: true, mode, allowEmails: [], allowDomains: [], ...over });

// Params the way Auth.js passes them.
const google = (email: string, verified = true) => ({
  user: { id: crypto.randomUUID(), email },
  account: { provider: "google", type: "oidc", providerAccountId: email } as never,
  profile: { email, email_verified: verified },
});
const magicSend = (email: string) => ({
  user: { id: crypto.randomUUID(), email },
  account: { provider: "nodemailer", type: "email", providerAccountId: email } as never,
  email: { verificationRequest: true },
});

const newUser = (email: string): AdapterUser =>
  ({ id: crypto.randomUUID(), email, emailVerified: null, name: "E2E" });

async function userCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(like(users.email, `%@${DOMAIN}`));
  return r?.n ?? 0;
}

async function cleanup() {
  await db.delete(invites).where(like(invites.email, `%@${DOMAIN}`));
  await db.delete(users).where(like(users.email, `%@${DOMAIN}`));
}

async function main() {
  await cleanup();
  const silence = console.warn;
  console.warn = () => {}; // the deny log line is expected noise here

  console.log("invite mode — denial");
  const before = await userCount();
  check("unknown Google e-mail is denied",
    (await registrationSignIn(db, google(addr("stranger")), env("invite"))) === false);
  check("magic-link denial returns the verify-request path (looks like success)",
    (await registrationSignIn(db, magicSend(addr("stranger")), env("invite"))) === VERIFY_REQUEST_PATH);
  check("denials create no user", (await userCount()) === before);

  console.log("invite mode — invite lifecycle");
  const getInvite = () => env("invite");
  const adapter = withInviteCreateUser({} as Adapter, db, getInvite);
  const friend = addr("friend");
  await addInvite(db, { email: friend, days: 14, createdBy: "e2e" });
  check("invited Google e-mail is allowed",
    (await registrationSignIn(db, google(friend), env("invite"))) === true);
  check("invited but unverified Google e-mail is denied",
    (await registrationSignIn(db, google(friend, false), env("invite"))) === false);
  const created = await adapter.createUser!(newUser(friend));
  const [inv] = await db.select().from(invites).where(eq(invites.email, friend));
  check("createUser consumes the invite", !!inv?.usedAt && inv.usedBy === created.id, inv);
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, created.id));
  check("createUser provisions user_settings", !!settings);
  check("the new member is an existing user afterwards",
    (await registrationSignIn(db, google(friend), env("invite"))) === true);

  await db.delete(users).where(eq(users.id, created.id));
  const reuse = await Promise.resolve(adapter.createUser!(newUser(friend))).then(() => "created", (e: Error) => e.message);
  check("a used invite cannot create a second account", reuse.includes("registration denied"), reuse);
  check("deleting the user keeps the invite as history", (await db.select().from(invites).where(eq(invites.email, friend)))[0]?.usedBy === null);

  console.log("invite mode — concurrency");
  const racer = addr("racer");
  await addInvite(db, { email: racer, days: 14, createdBy: "e2e" });
  const results = await Promise.allSettled([
    Promise.resolve(adapter.createUser!(newUser(racer))),
    Promise.resolve(adapter.createUser!(newUser(racer))),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const racerUsers = await db.select().from(users).where(eq(users.email, racer));
  check("two concurrent sign-ups with one invite create exactly one account", ok === 1 && racerUsers.length === 1, { ok, n: racerUsers.length });

  console.log("invite mode — expiry and revoke");
  const late = addr("late");
  await addInvite(db, { email: late, days: 1, createdBy: "e2e" });
  await db.update(invites).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invites.email, late));
  check("expired invite is denied", (await registrationSignIn(db, google(late), env("invite"))) === false);
  const gone = addr("revoked");
  await addInvite(db, { email: gone, days: 14, createdBy: "e2e" });
  await revokeInvite(db, gone);
  check("revoked invite is denied", (await registrationSignIn(db, google(gone), env("invite"))) === false);

  console.log("closed mode");
  check("existing user signs in under closed",
    (await registrationSignIn(db, google(racer), env("closed"))) === true);
  const pending = addr("pending");
  await addInvite(db, { email: pending, days: 14, createdBy: "e2e" });
  check("invited new e-mail is denied under closed",
    (await registrationSignIn(db, google(pending), env("closed"))) === false);
  const closedAdapter = withInviteCreateUser({} as Adapter, db, () => env("closed"));
  const closedCreate = await Promise.resolve(closedAdapter.createUser!(newUser(pending))).then(() => "created", (e: Error) => e.message);
  check("createUser refuses under closed too", closedCreate.includes("registration denied"), closedCreate);

  console.log("operator allowlists");
  const domainEnv = env("invite", { allowDomains: [DOMAIN] });
  check("allowed domain, unverified Google → denied",
    (await registrationSignIn(db, google(addr("team1"), false), domainEnv)) === false);
  check("allowed domain, verified Google → allowed",
    (await registrationSignIn(db, google(addr("team1")), domainEnv)) === true);
  const owner = addr("Owner");
  check("env e-mail allowlist matches case-insensitively",
    (await registrationSignIn(db, google(owner), env("closed", { allowEmails: [owner.toLowerCase()] }))) === true);
  check("existing user is matched case-insensitively",
    (await registrationSignIn(db, google(racer.toUpperCase()), env("closed"))) === true);

  console.warn = silence;
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
