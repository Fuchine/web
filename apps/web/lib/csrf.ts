// Cross-site mutation guard (C8), defense in depth on top of the SameSite=Lax
// session cookie. Pure and edge-safe (no Node imports): middleware.ts runs it on
// the edge runtime, and it is unit-tested directly.
//
// A state-changing /api request is refused when the browser says it is
// cross-site (`Sec-Fetch-Site: cross-site`) or its `Origin` names a different
// host than the one serving the request. Requests without either header (curl,
// server-to-server) pass: CSRF needs a browser, and browsers send `Origin` on
// every non-GET fetch/form POST.
//
// Exempt:
//   - /api/auth/*  — Auth.js has its own CSRF token (double-submit cookie) and
//                    receives OAuth provider callbacks / magic-link clicks.
//   - /api/import  with `Authorization: Bearer …` (T2.11) — a bearer token is
//                    not ambient (browsers never attach it on their own), so
//                    the request can't be forged cross-site; the route itself
//                    validates the token. Applies to /api/import only: every
//                    other route ignores tokens and keeps the full check.
//   - /api/import  from a browser-extension Origin (chrome-extension://,
//                    moz-extension://, safari-web-extension://) WITHOUT a
//                    token — DEPRECATED cookie path for Fuchine Importer
//                    < 0.2.0, which POSTs with the session cookie. A web page
//                    can't send an extension Origin, so this no longer exempts
//                    arbitrary cross-site pages (it did before T2.11). Planned
//                    removal: once 0.2.0 is the oldest supported extension
//                    (see docs/EXTENSION.md, "Deprecations").

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type CsrfInput = {
  method: string;
  pathname: string;
  /** Host the request was addressed to (X-Forwarded-Host behind a proxy, else Host). */
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  /** Raw `Authorization` header, if any. */
  authorization?: string | null;
};

/** Routes that accept a per-user API token (keep in sync with lib/request-auth.ts users). */
const TOKEN_ROUTES = new Set(["/api/import"]);

const EXTENSION_ORIGIN_RE = /^(chrome|moz|safari-web)-extension:\/\/[^/]+$/i;

function hasBearer(authorization: string | null | undefined): boolean {
  return !!authorization && /^Bearer[ \t]+\S/i.test(authorization);
}

function isExempt(req: CsrfInput): boolean {
  if (req.pathname.startsWith("/api/auth/")) return true;
  if (TOKEN_ROUTES.has(req.pathname)) {
    if (hasBearer(req.authorization)) return true;
    // Deprecated: pre-0.2.0 extension, session cookie from an extension origin.
    if (req.origin && EXTENSION_ORIGIN_RE.test(req.origin)) return true;
  }
  return false;
}

/** Returns the reason to block, or null when the request may proceed. */
export function crossSiteBlockReason(req: CsrfInput): string | null {
  if (!MUTATING.has(req.method.toUpperCase())) return null;
  if (!req.pathname.startsWith("/api/")) return null;
  if (isExempt(req)) return null;

  if (req.secFetchSite?.toLowerCase() === "cross-site") return "cross-site request";

  if (req.origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(req.origin).host; // "null" (opaque origin) throws
    } catch {
      return "opaque or invalid Origin";
    }
    if (!req.host || originHost.toLowerCase() !== req.host.toLowerCase()) {
      return "Origin does not match host";
    }
  }
  return null;
}
