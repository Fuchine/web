import { config } from "dotenv";

// Load the repo-root .env (worker runs from apps/worker).
config({ path: "../../.env" });
config({ path: ".env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
};
