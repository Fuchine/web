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
//   - /api/import  — the browser extension POSTs from a chrome-extension://
//                    origin with the user's cookies (until T2.11's API tokens).

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type CsrfInput = {
  method: string;
  pathname: string;
  /** Host the request was addressed to (X-Forwarded-Host behind a proxy, else Host). */
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
};

function isExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/import" ||
    pathname.startsWith("/api/import/")
  );
}

/** Returns the reason to block, or null when the request may proceed. */
export function crossSiteBlockReason(req: CsrfInput): string | null {
  if (!MUTATING.has(req.method.toUpperCase())) return null;
  if (!req.pathname.startsWith("/api/")) return null;
  if (isExempt(req.pathname)) return null;

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
