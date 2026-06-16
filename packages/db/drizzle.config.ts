import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the repo-root .env so `pnpm db:migrate` / `db:generate` pick up DATABASE_URL.
config({ path: "../../.env" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost/placeholder" },
});
