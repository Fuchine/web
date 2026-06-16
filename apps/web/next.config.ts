import type { NextConfig } from "next";
import { config } from "dotenv";

// Load the repo-root .env so a single env file powers web + worker + db scripts.
config({ path: "../../.env" });

const nextConfig: NextConfig = {
  // Internal packages ship as TypeScript source; Next transpiles them.
  transpilePackages: ["@fuchine/core", "@fuchine/db", "@fuchine/jobs", "@fuchine/llm", "@fuchine/nlp", "@fuchine/ui"],
  // kuromoji loads its dictionary from disk at runtime — never bundle it.
  serverExternalPackages: ["kuromoji"],
};

export default nextConfig;
