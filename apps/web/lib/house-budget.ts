// Web-process wiring for the house-key budget (T2.4). Config is read from env
// on every call (an env change needs a restart, never a rebuild); the spend
// figure is cached per process by createHouseBudget. Production boot rejects
// invalid values (instrumentation.ts); in dev an invalid value falls back to
// the defaults (unlimited, explain fallback on).

import { createHouseBudget, parseHouseBudgetEnv, type HouseBudget } from "@fuchine/llm";
import { db } from "./db";

export function houseBudgetConfig(): { dailyTokens: number | null; explainFallback: boolean } {
  const cfg = parseHouseBudgetEnv(process.env);
  return cfg.ok ? cfg : { dailyTokens: null, explainFallback: true };
}

let budget: HouseBudget | null = null;

/** The process-wide house budget checker. */
export function houseBudget(): HouseBudget {
  if (!budget) budget = createHouseBudget(db, { getLimit: () => houseBudgetConfig().dailyTokens });
  return budget;
}

/** Seconds until local midnight, when the daily budget resets (Retry-After). */
export function secondsUntilLocalMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}
