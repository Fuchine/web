// Request authentication for the routes that accept API tokens (T2.11).
//
// Every route authenticates with the Auth.js session (`auth()`). Only routes
// that explicitly opt in — today just POST /api/import, scope `import` — call
// authenticateRequest instead, which ALSO accepts `Authorization: Bearer fch_…`.
// The auth-coverage test (app/api/auth-coverage.test.ts) keeps the opt-in list
// explicit: a bearer token must get a 401 everywhere else.
//
// When a request carries a Bearer credential, the token decides: an invalid or
// revoked token is a 401 even if a session cookie is also present, so a client
// learns its token is dead instead of silently riding on the cookie.

import { parseBearer, verifyApiToken, type Scope, type TokenVerdict } from "./api-tokens";

export type RequestAuth =
  | { ok: true; userId: string; via: "session" | "token"; tokenId?: string }
  | { ok: false; error: "unauthorized" | "invalid_token"; message: string };

export type RequestAuthDeps = {
  session: () => Promise<{ user?: { id?: string | null } | null } | null>;
  verifyToken: (token: string, scope: Scope) => Promise<TokenVerdict>;
};

// Loaded lazily so this module stays importable outside Next (unit tests, the
// E2E suites under tsx) — those inject their own deps.
const defaultDeps: RequestAuthDeps = {
  session: async () => (await import("@/auth")).auth(),
  verifyToken: async (token, scope) => verifyApiToken((await import("@/lib/db")).db, token, scope),
};

export const INVALID_TOKEN_MESSAGE = "Token invalid or revoked";

/** Resolve the caller from a Bearer API token (if sent) or the session. */
export async function authenticateRequest(
  req: Request,
  scope: Scope,
  deps: RequestAuthDeps = defaultDeps,
): Promise<RequestAuth> {
  const bearer = parseBearer(req.headers.get("authorization"));
  if (bearer !== null) {
    const verdict = await deps.verifyToken(bearer, scope);
    if (verdict.ok) return { ok: true, userId: verdict.userId, via: "token", tokenId: verdict.tokenId };
    return { ok: false, error: "invalid_token", message: INVALID_TOKEN_MESSAGE };
  }
  const session = await deps.session();
  const userId = session?.user?.id;
  if (userId) return { ok: true, userId, via: "session" };
  return { ok: false, error: "unauthorized", message: "unauthorized" };
}

/** Standard 401 body + header for a failed authenticateRequest. */
export function unauthorizedResponseInit(a: Extract<RequestAuth, { ok: false }>) {
  return {
    body: a.error === "invalid_token" ? { error: a.message, code: "invalid_token" } : { error: "unauthorized" },
    init: {
      status: 401,
      headers:
        a.error === "invalid_token"
          ? { "WWW-Authenticate": 'Bearer error="invalid_token"' }
          : undefined,
    },
  };
}
