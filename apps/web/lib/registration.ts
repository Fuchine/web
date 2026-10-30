// Registration policy (T2.3, closes A1). Who may sign in and who may create an
// account. Pure: no DB, no Auth.js — `lib/auth-registration.ts` gathers the
// inputs, this decides. Spec: docs/plans/2026-10-30-registration-control-spec.md.

export const REGISTRATION_MODES = ["open", "invite", "closed"] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export type RegistrationEnv =
  | { ok: true; mode: RegistrationMode; allowEmails: string[]; allowDomains: string[] }
  | { ok: false; error: string };

function list(raw: string | undefined, strip?: RegExp): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.normalize("NFKC").trim().toLowerCase())
    .map((s) => (strip ? s.replace(strip, "") : s))
    .filter(Boolean);
}

/**
 * Read REGISTRATION / AUTH_ALLOWED_EMAILS / AUTH_ALLOWED_DOMAINS. Unset mode is
 * `open` in development and `invite` in production — a production instance is
 * never open by omission.
 */
export function parseRegistrationEnv(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): RegistrationEnv {
  const raw = env.REGISTRATION?.trim().toLowerCase();
  const mode = raw || (nodeEnv === "production" ? "invite" : "open");
  if (!REGISTRATION_MODES.includes(mode as RegistrationMode)) {
    return {
      ok: false,
      error: `REGISTRATION must be one of ${REGISTRATION_MODES.join(", ")} (got "${env.REGISTRATION}")`,
    };
  }
  return {
    ok: true,
    mode: mode as RegistrationMode,
    allowEmails: list(env.AUTH_ALLOWED_EMAILS),
    allowDomains: list(env.AUTH_ALLOWED_DOMAINS, /^@/),
  };
}

export type RegistrationInput = {
  mode: RegistrationMode;
  /** Already normalized (normalizeEmail); null when unusable. */
  email: string | null;
  /** False only for an OAuth profile that did not verify the address. */
  emailVerified: boolean;
  isExistingUser: boolean;
  hasActiveInvite: boolean;
  allowEmails: string[];
  allowDomains: string[];
};

export type RegistrationDecision =
  | { allow: true; via: "open" | "existing" | "env-email" | "env-domain" | "invite" }
  | { allow: false; reason: "closed" | "not-invited" | "unverified" | "bad-email" };

export function decideRegistration(i: RegistrationInput): RegistrationDecision {
  if (!i.email) return { allow: false, reason: "bad-email" };
  if (i.mode === "open") return { allow: true, via: "open" };
  // Existing members always get in: closing registration never locks anyone out.
  if (i.isExistingUser) return { allow: true, via: "existing" };

  // The operator's own list applies in every mode. Exact address first.
  if (i.allowEmails.includes(i.email)) {
    return i.emailVerified ? { allow: true, via: "env-email" } : { allow: false, reason: "unverified" };
  }
  const domain = i.email.slice(i.email.lastIndexOf("@") + 1);
  if (i.allowDomains.includes(domain)) {
    return i.emailVerified ? { allow: true, via: "env-domain" } : { allow: false, reason: "unverified" };
  }

  if (i.mode === "closed") return { allow: false, reason: "closed" };
  if (i.hasActiveInvite) {
    return i.emailVerified ? { allow: true, via: "invite" } : { allow: false, reason: "unverified" };
  }
  return { allow: false, reason: "not-invited" };
}

/** The one message every denied person sees (no hint about why). */
export const ACCESS_DENIED_MESSAGE =
  "This Fuchine instance is invite-only. Ask its operator for an invite.";
