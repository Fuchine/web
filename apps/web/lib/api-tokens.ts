// Per-user API tokens (T2.11). Auth-agnostic and testable; routes add the session
// check. A token lets a client (the browser extension first) call POST
// /api/import with `Authorization: Bearer fch_…` instead of depending on the
// session cookie being sent cross-origin from a chrome-extension:// page.
//
// Format: `fch_` + 43 base62 chars drawn from crypto.randomBytes (≈256 bits).
// Storage: only the hex SHA-256 of the whole token. That is deliberate, not a
// shortcut: bcrypt/scrypt/argon2 slow down guessing LOW-entropy secrets
// (passwords). A 256-bit random token can't be guessed however fast the hash
// is, and a deterministic hash lets the lookup be a unique-index hit — a slow
// salted hash would force comparing against every row. A DB leak exposes
// hashes that are useless as bearer credentials.
//
// The raw token is returned exactly once (on create) and never stored or logged.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { type Database, apiTokens } from "@fuchine/db";
import { isUuid } from "./ids";

export type Result = { status: number; body: Record<string, unknown> };

export const TOKEN_PREFIX = "fch_";
/** 43 base62 chars ≥ 256 bits (log2(62) ≈ 5.954 bits/char). */
export const TOKEN_BODY_LENGTH = 43;
/** Characters of the token kept in clear for display ("fch_" + 8). */
export const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 8;
export const MAX_ACTIVE_TOKENS = 10;
export const NAME_MAX = 60;
/** Scopes a token can carry. Only `import` exists today. */
export const SCOPES = ["import"] as const;
export type Scope = (typeof SCOPES)[number];
/** `last_used_at` is written at most this often per token. */
export const LAST_USED_RESOLUTION_MS = 60_000;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_RE = new RegExp(`^${TOKEN_PREFIX}[0-9A-Za-z]{${TOKEN_BODY_LENGTH}}$`);

/** A fresh random token. Rejection sampling keeps every base62 char uniform. */
export function generateApiToken(): string {
  let out = "";
  while (out.length < TOKEN_BODY_LENGTH) {
    for (const b of randomBytes(64)) {
      if (b >= 248) continue; // 248 = 4 × 62: drop the biased tail
      out += BASE62[b % 62];
      if (out.length === TOKEN_BODY_LENGTH) break;
    }
  }
  return TOKEN_PREFIX + out;
}

/** True when `v` has the exact shape of a Fuchine API token. */
export function isApiTokenFormat(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

/**
 * Server key for token hashes: `API_TOKEN_PEPPER` if set, else `AUTH_SECRET`
 * (required in production, see instrumentation). Keying the hash means a
 * database leak alone can't confirm a guessed token. Rotating the key
 * invalidates every API token — users create new ones in Settings.
 */
function tokenHashKey(): string {
  const key = process.env.API_TOKEN_PEPPER || process.env.AUTH_SECRET;
  if (key) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("API token hashing needs AUTH_SECRET (or API_TOKEN_PEPPER)");
  }
  return "fuchine-dev-api-token-key"; // dev/test only
}

/** Hex HMAC-SHA256 of the token — the only form that touches the database. */
export function hashApiToken(token: string): string {
  return createHmac("sha256", tokenHashKey()).update(token, "utf8").digest("hex");
}

/** The non-secret part shown in Settings to tell tokens apart. */
export function displayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH);
}

/**
 * The bearer credential of an `Authorization` header value, or null when the
 * header is absent or uses another scheme. Whatever follows `Bearer` is
 * returned (trimmed, possibly empty or malformed) so the caller rejects it —
 * never silently falls back to the cookie: a client that sent a token meant
 * to authenticate with it.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^\s*Bearer(?:[ \t]+(.*))?$/is.exec(header);
  return m ? (m[1] ?? "").trim() : null;
}

/** Validate the create body: `{ name }`, trimmed, 1..NAME_MAX chars. */
export function parseTokenName(body: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string") return { ok: false, error: "name is required" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "name must not be blank" };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `name must be at most ${NAME_MAX} characters` };
  return { ok: true, name: trimmed };
}

/* ------------------------------- Settings ------------------------------- */

export type ApiTokenView = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const viewColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  prefix: apiTokens.prefix,
  scopes: apiTokens.scopes,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
  revokedAt: apiTokens.revokedAt,
};

function toView(r: {
  id: string; name: string; prefix: string; scopes: string[];
  createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null;
}): ApiTokenView {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
  };
}

/** The user's tokens, newest first (active and revoked). Never the hash. */
export async function listApiTokens(db: Database, userId: string): Promise<ApiTokenView[]> {
  const rows = await db
    .select(viewColumns)
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
  return rows.map(toView);
}

/**
 * Create a token for the user. Returns the raw token once (`token`); after
 * this response only its hash exists. Capped at MAX_ACTIVE_TOKENS active
 * tokens; the cap is checked inside a transaction holding a per-user advisory
 * lock so two concurrent creates can't both pass it.
 */
export async function createApiToken(db: Database, userId: string, body: unknown): Promise<Result> {
  const parsed = parseTokenName(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };

  const token = generateApiToken();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"api_tokens:" + userId}))`);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
    if (n >= MAX_ACTIVE_TOKENS) {
      return {
        status: 409,
        body: { error: `You can have at most ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.` },
      };
    }
    const [row] = await tx
      .insert(apiTokens)
      .values({
        userId,
        name: parsed.name,
        tokenHash: hashApiToken(token),
        prefix: displayPrefix(token),
        scopes: ["import"],
      })
      .returning(viewColumns);
    return { status: 201, body: { token, apiToken: toView(row!) } };
  });
}

/** Revoke one of the user's tokens. Another user's id is a 404, like a missing one. */
export async function revokeApiToken(db: Database, userId: string, id: string): Promise<Result> {
  if (!isUuid(id)) return { status: 404, body: { error: "token not found" } };
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: sql`coalesce(${apiTokens.revokedAt}, now())` })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning(viewColumns);
  if (!row) return { status: 404, body: { error: "token not found" } };
  return { status: 200, body: { apiToken: toView(row) } };
}

/* ---------------------------- Authentication ---------------------------- */

export type TokenVerdict =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: "malformed" | "unknown" | "revoked" | "scope" };

/**
 * Resolve a bearer token to its owner. The lookup is by SHA-256 hash through a
 * unique index, so response time doesn't depend on how many leading characters
 * of a guess match a real token (the classic string-compare timing leak); the
 * final hash comparison is constant-time anyway. Revoked tokens and tokens
 * without `scope` are refused. `last_used_at` is bumped at most once per
 * LAST_USED_RESOLUTION_MS (a conditional UPDATE: no write on hot paths).
 */
export async function verifyApiToken(db: Database, token: string, scope: Scope): Promise<TokenVerdict> {
  if (!isApiTokenFormat(token)) return { ok: false, reason: "malformed" };
  const hash = hashApiToken(token);
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      tokenHash: apiTokens.tokenHash,
      scopes: apiTokens.scopes,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);
  if (!row || !timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) {
    return { ok: false, reason: "unknown" };
  }
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (!row.scopes.includes(scope)) return { ok: false, reason: "scope" };

  const staleBefore = new Date(Date.now() - LAST_USED_RESOLUTION_MS);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, row.id),
        or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, staleBefore)),
      ),
    );
  return { ok: true, userId: row.userId, tokenId: row.id };
}
