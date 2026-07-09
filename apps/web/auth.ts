import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import {
  ensureUserSettings,
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@fuchine/db";
import { db } from "./lib/db";

// Providers are enabled only when configured, so a self-host instance never
// shows a sign-in button that errors on click:
//   - Google: only when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set (otherwise
//     Auth.js registers an OIDC provider with no credentials → "Configuration"
//     error page). Auth.js reads those env vars itself.
//   - Email magic link: only when SMTP is configured (EMAIL_SERVER).
// Production boot fails fast if neither is configured (see instrumentation.ts).
const providers: NextAuthConfig["providers"] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}
if (process.env.EMAIL_SERVER) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  );
} else if (process.env.NODE_ENV !== "production") {
  // Dev convenience: passwordless sign-in with no SMTP/Google setup — the magic
  // link is printed to the `next dev` terminal. Works with database sessions.
  // Never active in production (no EMAIL_SERVER there means email is simply off).
  providers.push(
    Nodemailer({
      server: { host: "localhost", port: 587 },
      from: "dev@fuchine.local",
      async sendVerificationRequest({ url }) {
        console.log(`\n🔑 Fuchine dev sign-in link (open it in this browser):\n${url}\n`);
      },
    }),
  );
}

// Auth.js (NextAuth v5). Persisted via the Drizzle adapter against our own
// tables. Database sessions resolve to a `users` row. New accounts get a
// settings row through the createUser event.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  trustHost: true,
  providers,
  events: {
    async createUser({ user }) {
      if (user.id) await ensureUserSettings(db, user.id);
    },
  },
});
