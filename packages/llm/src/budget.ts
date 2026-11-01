// House-key spend ceiling (T2.4). The operator's key pays for chunk
// translation, explanations of users without BYOK, and the background
// pre-warm; per-user rate limits don't bound the total, this does. Spend is
// read from `llm_usage` (key_source = 'house') since local midnight, cached
// per process for a short TTL so the check costs one indexed query per TTL.
// Spec: docs/plans/2026-10-30-house-budget-spec.md.

import { and, eq, gte, sql } from "drizzle-orm";
import { llmUsage, type Database } from "@fuchine/db";

export type HouseBudgetConfig =
  | { ok: true; dailyTokens: number | null; explainFallback: boolean }
  | { ok: false; error: string };

/** Parse HOUSE_DAILY_TOKEN_BUDGET (unset/empty = unlimited) and HOUSE_EXPLAIN_FALLBACK (default true). */
export function parseHouseBudgetEnv(env: Record<string, string | undefined>): HouseBudgetConfig {
  const rawBudget = env.HOUSE_DAILY_TOKEN_BUDGET?.trim();
  let dailyTokens: number | null = null;
  if (rawBudget) {
    const n = Number(rawBudget.replace(/_/g, ""));
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: `HOUSE_DAILY_TOKEN_BUDGET must be a positive integer (got "${rawBudget}")` };
    }
    dailyTokens = n;
  }
  const rawFallback = env.HOUSE_EXPLAIN_FALLBACK?.trim().toLowerCase();
  if (rawFallback && !["true", "false"].includes(rawFallback)) {
    return { ok: false, error: `HOUSE_EXPLAIN_FALLBACK must be true or false (got "${env.HOUSE_EXPLAIN_FALLBACK}")` };
  }
  return { ok: true, dailyTokens, explainFallback: rawFallback !== "false" };
}

export type BudgetState = "unlimited" | "ok" | "exhausted";

/** Pure: where `used` stands against `limit` (null = no ceiling). */
export function budgetState(used: number, limit: number | null): BudgetState {
  if (limit === null) return "unlimited";
  return used >= limit ? "exhausted" : "ok";
}

/** Local midnight of `now` (the process TZ — same boundary as daily stats). */
export function startOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export type SpendBreakdown = { house: number; byok: number; houseByFn: Record<string, number> };

/** Tokens (in + out) spent today, by key source, plus house tokens by function. */
export async function getSpendToday(db: Database, now = new Date()): Promise<SpendBreakdown> {
  const rows = await db
    .select({
      keySource: llmUsage.keySource,
      fn: llmUsage.fn,
      tokens: sql<number>`coalesce(sum(coalesce(${llmUsage.inTokens}, 0) + coalesce(${llmUsage.outTokens}, 0)), 0)::bigint`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, startOfLocalDay(now)))
    .groupBy(llmUsage.keySource, llmUsage.fn);
  const out: SpendBreakdown = { house: 0, byok: 0, houseByFn: {} };
  for (const r of rows) {
    const n = Number(r.tokens);
    if (r.keySource === "byok") out.byok += n;
    else {
      out.house += n;
      out.houseByFn[r.fn] = (out.houseByFn[r.fn] ?? 0) + n;
    }
  }
  return out;
}

/** House tokens spent today (the number the ceiling compares against). */
export async function getHouseTokensToday(db: Database, now = new Date()): Promise<number> {
  const [row] = await db
    .select({
      tokens: sql<number>`coalesce(sum(coalesce(${llmUsage.inTokens}, 0) + coalesce(${llmUsage.outTokens}, 0)), 0)::bigint`,
    })
    .from(llmUsage)
    .where(and(eq(llmUsage.keySource, "house"), gte(llmUsage.createdAt, startOfLocalDay(now))));
  return Number(row?.tokens ?? 0);
}

export type HouseBudget = {
  /** Current state; reads the DB at most once per TTL. Fails OPEN on a DB error. */
  state(): Promise<BudgetState>;
  /** Drop the cached figure (tests, or after a known large spend). */
  invalidate(): void;
};

/**
 * A per-process budget checker. `getLimit` is read on every call so an env
 * change applies without rebuilding; the spend figure is cached for `ttlMs`
 * and keyed by local day, so midnight resets immediately. A DB failure fails
 * open: the budget is a cost guard and must not take explanations down.
 */
export function createHouseBudget(
  db: Database,
  opts: {
    getLimit: () => number | null;
    ttlMs?: number;
    now?: () => Date;
    readSpend?: (db: Database, now: Date) => Promise<number>;
  },
): HouseBudget {
  const ttl = opts.ttlMs ?? 30_000;
  const now = opts.now ?? (() => new Date());
  const read = opts.readSpend ?? getHouseTokensToday;
  let cache: { day: number; at: number; used: number } | null = null;

  return {
    async state() {
      const limit = opts.getLimit();
      if (limit === null) return "unlimited";
      const t = now();
      const day = startOfLocalDay(t).getTime();
      if (!cache || cache.day !== day || t.getTime() - cache.at >= ttl) {
        try {
          cache = { day, at: t.getTime(), used: await read(db, t) };
        } catch (err) {
          console.error("[budget] spend query failed (failing open)", err);
          return "ok";
        }
      }
      return budgetState(cache.used, limit);
    },
    invalidate() {
      cache = null;
    },
  };
}

/** User-facing copy for the two refusal codes (shared by web routes and the player). */
export const HOUSE_BUDGET_MESSAGE =
  "AI is paused on this instance for today (daily budget reached). Cached explanations still work.";
export const BYOK_REQUIRED_MESSAGE =
  "Add your own API key in Settings to generate new explanations. Cached explanations still work.";
