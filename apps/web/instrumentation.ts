// Next.js instrumentation hook: runs once when the server process starts. We use
// it to fail fast on a broken production config instead of letting the app boot
// "healthy" and break request-by-request in runtime (backlog:
// env-validation-fail-fast). Dev keeps all its convenience defaults.

export async function register() {
  // Only the Node.js server runtime; skip the edge runtime and the browser.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Persist per-request LLM usage into `llm_usage` (backlog: llm-usage-metering).
  // Dynamic imports so the db/llm modules never reach the edge bundle.
  const { setUsageSink, dbUsageSink } = await import("@fuchine/llm");
  const { db } = await import("@/lib/db");
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
