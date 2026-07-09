import type { NextConfig } from "next";
import { config } from "dotenv";
import { join } from "node:path";

// Load the repo-root .env so a single env file powers web + worker + db scripts.
config({ path: "../../.env" });

// Conservative security headers. The CSP intentionally scopes only frames /
// images / objects for now — the YouTube IFrame player and thumbnails must keep
// working, and a strict script-src in Next needs per-request nonces (a later,
// Report-Only-first hardening pass). See backlog: tls-and-security-headers.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "img-src 'self' https://img.youtube.com https://i.ytimg.com data:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
