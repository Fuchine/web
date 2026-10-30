// Node.js-only body of the instrumentation hook: instrumentation.ts imports this
// module only when NEXT_RUNTIME === "nodejs", so its Node imports never reach the
// edge bundle. Runs once when the server process starts. We use it to fail fast
// on a broken production config instead of letting the app boot "healthy" and
// break request-by-request in runtime (backlog: env-validation-fail-fast). Dev
// keeps all its convenience defaults.

import { setUsageSink, dbUsageSink, parseHouseBudgetEnv } from "@fuchine/llm";
import { db } from "@/lib/db";
import { parseRegistrationEnv } from "@/lib/registration";

export async function registerNode() {
  // Persist per-request LLM usage into `llm_usage` (backlog: llm-usage-metering).
  setUsageSink(dbUsageSink(db));

  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];

  // Hard requirements — the app cannot function without these.
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL (Postgres connection string)");
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET (openssl rand -base64 32)");
  if (!process.env.FUCHINE_ENCRYPTION_KEY)
    missing.push("FUCHINE_ENCRYPTION_KEY (openssl rand -base64 32)");

  // At least one usable sign-in method must exist, or the first user is locked
  // out. Google (Auth.js reads AUTH_GOOGLE_ID/SECRET) or email magic link.
  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const hasEmail = Boolean(process.env.EMAIL_SERVER);
  if (!hasGoogle && !hasEmail) {
    missing.push(
      "a sign-in method — set AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET, or EMAIL_SERVER",
    );
  }

  // Registration control (T2.3). An unknown mode is a hard error; an instance
  // nobody can join, or one anyone can join, is a loud warning.
  const registration = parseRegistrationEnv(process.env, process.env.NODE_ENV);
  if (!registration.ok) missing.push(registration.error);

  // House-key budget (T2.4): invalid values are a hard error.
  const budget = parseHouseBudgetEnv(process.env);
  if (!budget.ok) missing.push(budget.error);

  if (missing.length > 0) {
    // Exit, don't just throw: Next logs a thrown error from register() but keeps
    // the process alive serving 500s, so `restart: unless-stopped` never restarts
    // it. A non-zero exit makes the misconfig a loud crash the operator/orchestrator
    // can actually see and act on.
    console.error(
      "Fuchine cannot start: missing production configuration.\n" +
        missing.map((m) => `  - ${m}`).join("\n") +
        "\nSee .env.example for every variable.",
    );
    process.exit(1);
  }

  if (registration.ok && registration.mode === "open") {
    console.warn(
      "[fuchine] REGISTRATION=open — any Google account (or any e-mail, with SMTP) can " +
        "create an account and spend the house LLM key. Use invite or closed for a public instance.",
    );
  } else if (
    registration.ok &&
    registration.allowEmails.length === 0 &&
    registration.allowDomains.length === 0
  ) {
    console.warn(
      `[fuchine] REGISTRATION=${registration.mode} with no AUTH_ALLOWED_EMAILS / AUTH_ALLOWED_DOMAINS — ` +
        "only existing users and invited e-mails can sign in. On a new instance, set " +
        "AUTH_ALLOWED_EMAILS to your address or run `pnpm --filter @fuchine/worker invite add <email>`.",
    );
  }

  if (budget.ok && budget.dailyTokens === null && (process.env.LLM_PROVIDER ?? "echo") !== "echo") {
    console.warn(
      "[fuchine] HOUSE_DAILY_TOKEN_BUDGET is unset — house-key AI spend has no daily ceiling. " +
        "Set it (e.g. 2000000) before opening the instance to other people.",
    );
  }

  // Soft warning: `echo` is the dev default that leaves AI silently off. In
  // production that's almost never intended, so make it loud.
  const provider = process.env.LLM_PROVIDER ?? "echo";
  if (provider === "echo") {
    console.warn(
      "[fuchine] LLM_PROVIDER is 'echo' — house AI (import translation, explain " +
        "pre-warm) is disabled. Set LLM_PROVIDER/LLM_API_KEY, or users must bring " +
        "their own keys (BYOK).",
    );
  }
}
