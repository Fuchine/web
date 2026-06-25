import type { NextConfig } from "next";
import { config } from "dotenv";

// Load the repo-root .env so a single env file powers web + worker + db scripts.
config({ path: "../../.env" });

const nextConfig: NextConfig = {
  // Internal packages ship as TypeScript source; Next transpiles them.
  transpilePackages: ["@fuchine/core", "@fuchine/db", "@fuchine/jobs", "@fuchine/llm", "@fuchine/nlp", "@fuchine/ui"],
  // kuromoji loads its dictionary from disk at runtime — never bundle it.
  serverExternalPackages: ["kuromoji"],
  // Baseline security headers on every response. The app itself is never meant
  // to be framed (the YouTube player is the iframe, not us), so deny framing to
  // block clickjacking; stop MIME sniffing; and keep referrers same-origin so
  // URLs (which can carry video/session context) don't leak cross-site.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
