// Pure helpers shared by the popup and the background service worker.

/** Instance used when the user hasn't configured one (local dev). */
export const DEFAULT_BASE = "http://localhost:3000";

/** Id of the dynamically registered bridge content script. */
export const BRIDGE_SCRIPT_ID = "bridge-dynamic";

/** Path of the built bridge content script (WXT output for entrypoints/bridge.content.ts). */
export const BRIDGE_SCRIPT_FILE = "content-scripts/bridge.js";

/**
 * "Known issues" page linked from the popup. Override at build time with
 * WXT_STATUS_URL (e.g. a page on the maintainer's site).
 */
export const STATUS_URL: string =
  import.meta.env.WXT_STATUS_URL ||
  "https://github.com/Fuchine/web/blob/main/docs/EXTENSION_STATUS.md";

/** Normalize a user-typed instance URL (trailing slashes off), defaulting to dev. */
export function normalizeBase(base: string | undefined | null): string {
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

/** `https://host/*` match pattern for an instance base URL, or null if unparseable. */
export function originPattern(base: string): string | null {
  try {
    return new URL(base).origin + "/*";
  } catch {
    return null;
  }
}

/** True for the dev origin that the static manifest already covers. */
export function isStaticBridgeOrigin(origin: string): boolean {
  return /^https?:\/\/localhost:3000$/.test(origin);
}

/** Match pattern used to register the bridge for an instance origin. */
export function bridgeMatchPattern(origin: string): string {
  return origin.replace(/\/+$/, "") + "/*";
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Only a bare 11-char YouTube id is accepted, so a crafted message can't inject
 * extra query params into the watch URL.
 */
export function isVideoId(v: unknown): v is string {
  return typeof v === "string" && VIDEO_ID_RE.test(v);
}

/* ------------------------------ API token ------------------------------ */
// Per-user API token (Fuchine Settings → Extension & API, T2.11). Stored in
// chrome.storage.local next to `base` and sent as `Authorization: Bearer`;
// never logged, never shown back in full. Without a token the extension falls
// back to the session cookie (deprecated server-side).

const API_TOKEN_RE = /^fch_[0-9A-Za-z]{43}$/;

/** Trim a pasted token (people paste with spaces or a trailing newline). */
export function normalizeToken(raw: string | undefined | null): string {
  return (raw || "").trim();
}

/** True for a well-formed Fuchine API token. */
export function isApiTokenFormat(v: unknown): v is string {
  return typeof v === "string" && API_TOKEN_RE.test(v);
}

/**
 * The token to send to `origin`, or null. The token belongs to the instance
 * configured in the popup: a request to any other origin (e.g. a bridge on a
 * different instance) never carries it.
 */
export function tokenForOrigin(
  stored: { base?: string; apiToken?: string },
  origin: string,
): string | null {
  const token = normalizeToken(stored.apiToken);
  if (!token) return null;
  try {
    if (new URL(normalizeBase(stored.base)).origin !== new URL(origin).origin) return null;
  } catch {
    return null;
  }
  return token;
}

/**
 * Request init for POST /api/import. With a token: Bearer header and no
 * cookies (`credentials: "omit"`), so the request doesn't depend on SameSite
 * cookies at all. Without one: the legacy cookie path.
 */
export function importRequestInit(body: unknown, token: string | null): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    method: "POST",
    headers,
    credentials: token ? "omit" : "include",
    body: JSON.stringify(body),
  };
}

/** User-facing message for a 401 from /api/import. */
export function unauthorizedMessage(usedToken: boolean): string {
  return usedToken
    ? "Token invalid or revoked. Create a new one in Fuchine → Settings → Extension & API."
    : "Sign in to Fuchine first, or paste an API token from Settings → Extension & API.";
}
