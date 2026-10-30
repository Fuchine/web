import type { NextConfig } from "next";
import { config } from "dotenv";
import { join } from "node:path";

// Load the repo-root .env so a single env file powers web + worker + db scripts.
config({ path: "../../.env" });

// Conservative security headers. The CSP intentionally scopes only frames /
// images / objects for now — the YouTube IFrame player and thumbnails must keep
// working, and a strict script-src in Next needs per-request nonces (a later,
// Report-Only-first hardening pass). See backlog: tls-and-security-headers.
//
// Anti-clickjacking (B2): nothing may frame the app — `frame-ancestors 'none'`
// plus the legacy `X-Frame-Options: DENY` for old browsers. `form-action`
// limits where a form may submit; Google is listed because the Auth.js
// built-in sign-in page POSTs to /api/auth/signin/google and is redirected to
// accounts.google.com (Chrome checks form-action on the redirect too).
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "img-src 'self' https://img.youtube.com https://i.ytimg.com data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://accounts.google.com",
      // PWA (T3.13): only our own /sw.js and /manifest.webmanifest. Without a
      // default-src these would otherwise be unrestricted.
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Powerful features off by default. The microphone stays allowed for our own
  // origin (in-browser shadowing records the learner's voice). Features the
  // YouTube iframe delegates (autoplay, fullscreen, encrypted-media,
  // picture-in-picture) are left at their browser defaults on purpose.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "browsing-topics=()",
      "microphone=(self)",
    ].join(", "),
  },
  // HSTS is safe to send always; browsers only honor it over https.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Standalone server output for a lean Docker image (self-host). Trace from the
  // monorepo root so the workspace packages and hoisted node_modules are bundled.
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  // Internal packages ship as TypeScript source; Next transpiles them.
  transpilePackages: ["@fuchine/core", "@fuchine/db", "@fuchine/jobs", "@fuchine/llm", "@fuchine/nlp", "@fuchine/ui"],
  // kuromoji loads its dictionary from disk at runtime — never bundle it.
  serverExternalPackages: ["kuromoji"],
  // Render <head> metadata up front for every client, not streamed into <body>
  // (Next ≥ 15.2 streams it for non-bot UAs). Chrome only reads the web app
  // manifest <link> from <head>, so streaming broke PWA installability (T3.13).
  // Our metadata is static, so blocking on it costs nothing.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must be revalidated on every check, or a fixed
      // worker can sit behind an HTTP cache after a deploy.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
