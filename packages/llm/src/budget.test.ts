import { describe, expect, it, vi } from "vitest";
import type { Database } from "@fuchine/db";
import { budgetState, createHouseBudget, parseHouseBudgetEnv, startOfLocalDay } from "./budget";

describe("parseHouseBudgetEnv", () => {
  it("defaults to unlimited with explain fallback on", () => {
    expect(parseHouseBudgetEnv({})).toEqual({ ok: true, dailyTokens: null, explainFallback: true });
  });
  it("reads a budget, accepting underscores", () => {
    expect(parseHouseBudgetEnv({ HOUSE_DAILY_TOKEN_BUDGET: "2_000_000" })).toMatchObject({ dailyTokens: 2_000_000 });
  });
  it("rejects zero, negatives, decimals and junk", () => {
    for (const v of ["0", "-5", "1.5", "lots"]) {
      expect(parseHouseBudgetEnv({ HOUSE_DAILY_TOKEN_BUDGET: v }).ok).toBe(false);
    }
  });
  it("reads the fallback flag and rejects other values", () => {
    expect(parseHouseBudgetEnv({ HOUSE_EXPLAIN_FALLBACK: "False" })).toMatchObject({ explainFallback: false });
    expect(parseHouseBudgetEnv({ HOUSE_EXPLAIN_FALLBACK: "no" }).ok).toBe(false);
  });
});

describe("budgetState", () => {
  it("is unlimited without a limit, exhausted at or past it", () => {
    expect(budgetState(10 ** 9, null)).toBe("unlimited");
    expect(budgetState(99, 100)).toBe("ok");
    expect(budgetState(100, 100)).toBe("exhausted");
  });
});

describe("createHouseBudget", () => {
  const db = {} as Database;

  it("never queries when unlimited", async () => {
    const readSpend = vi.fn();
    const b = createHouseBudget(db, { getLimit: () => null, readSpend });
    expect(await b.state()).toBe("unlimited");
    expect(readSpend).not.toHaveBeenCalled();
  });

  it("caches the spend for the TTL, then re-reads", async () => {
    let t = new Date(2026, 9, 30, 12, 0, 0);
    const readSpend = vi.fn(async () => 50);
    const b = createHouseBudget(db, { getLimit: () => 100, ttlMs: 30_000, now: () => t, readSpend });
    expect(await b.state()).toBe("ok");
    t = new Date(t.getTime() + 10_000);
    await b.state();
    expect(readSpend).toHaveBeenCalledTimes(1);
    t = new Date(t.getTime() + 25_000);
    readSpend.mockResolvedValueOnce(150);
    expect(await b.state()).toBe("exhausted");
    expect(readSpend).toHaveBeenCalledTimes(2);
  });

  it("re-reads at local midnight even within the TTL", async () => {
    let t = new Date(2026, 9, 30, 23, 59, 50);
    const readSpend = vi.fn(async (_db: Database, _now: Date) => 500);
    const b = createHouseBudget(db, { getLimit: () => 100, ttlMs: 60_000, now: () => t, readSpend });
    expect(await b.state()).toBe("exhausted");
    t = new Date(2026, 9, 31, 0, 0, 5);
    readSpend.mockResolvedValueOnce(0);
    expect(await b.state()).toBe("ok");
    expect(readSpend.mock.calls[1]![1]).toEqual(t);
    expect(startOfLocalDay(t).getDate()).toBe(31);
  });

  it("fails open when the spend query throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = createHouseBudget(db, { getLimit: () => 1, readSpend: async () => { throw new Error("db down"); } });
    expect(await b.state()).toBe("ok");
  });
});
