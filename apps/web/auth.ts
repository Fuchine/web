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

// Email magic link is optional: only enabled when SMTP is configured. Google
// works on its own, so self-host without an SMTP server still has sign-in.
const providers: NextAuthConfig["providers"] = [Google];
if (process.env.EMAIL_SERVER) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
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
