import { config } from "dotenv";

// Load the repo-root .env (worker runs from apps/worker).
config({ path: "../../.env" });
config({ path: ".env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalInt(name: string, dflt: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Cap the eager per-import layer-2 pre-warm to the first N lines (the tail is
  // covered on demand by the player's prefetch). A large value warms the whole
  // video (old behavior); see backlog/prewarm-cost-per-import.
  prewarmMaxLines: optionalInt("PREWARM_MAX_LINES", 150),
};
