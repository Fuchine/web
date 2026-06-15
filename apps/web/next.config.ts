import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal packages ship as TypeScript source; Next transpiles them.
  transpilePackages: ["@fuchine/core", "@fuchine/db", "@fuchine/jobs", "@fuchine/llm", "@fuchine/nlp"],
  // kuromoji loads its dictionary from disk at runtime — never bundle it.
  serverExternalPackages: ["kuromoji"],
};

export default nextConfig;
