// Edge middleware: rejects cross-site mutations under /api (C8). Runs on the
// edge runtime, so it imports only edge-safe code (lib/csrf.ts is pure).
import { NextResponse, type NextRequest } from "next/server";
import { crossSiteBlockReason } from "./lib/csrf";

export function middleware(req: NextRequest) {
  const reason = crossSiteBlockReason({
    method: req.method,
    pathname: req.nextUrl.pathname,
    // The proxy (Caddy) sets X-Forwarded-Host to the client-facing host; a
    // cross-site page can't forge it (custom headers need a CORS preflight).
    host:
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host"),
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    authorization: req.headers.get("authorization"),
  });
  if (reason) {
    return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
