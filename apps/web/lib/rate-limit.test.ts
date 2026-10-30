import { describe, it, expect } from "vitest";
import {
  checkRateLimit,
  FAIL_CLOSED,
  RATE_LIMITS,
  STORE_DOWN_RETRY_SECONDS,
  type RateStore,
} from "./rate-limit";

class MemStore implements RateStore {
  counts = new Map<string, number>();
  async incr(key: string): Promise<number> {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }
}

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then denies", async () => {
    const store = new MemStore();
    const results = [];
    for (let i = 0; i < RATE_LIMITS.magicLink.limit + 1; i++) {
      results.push(await checkRateLimit(store, "magicLink", "e@x.com"));
    }
    expect(results.slice(0, RATE_LIMITS.magicLink.limit).every((r) => r.ok)).toBe(true);
    const over = results[RATE_LIMITS.magicLink.limit]!;
    expect(over.ok).toBe(false);
    expect(over.retryAfterSeconds).toBe(RATE_LIMITS.magicLink.windowSeconds);
  });

  it("reports the remaining allowance", async () => {
    const store = new MemStore();
    const first = await checkRateLimit(store, "magicLink", "a");
    expect(first).toMatchObject({ ok: true, remaining: RATE_LIMITS.magicLink.limit - 1 });
  });

  it("counts each (action, id) independently", async () => {
    const store = new MemStore();
    for (let i = 0; i < RATE_LIMITS.magicLink.limit; i++) await checkRateLimit(store, "magicLink", "a");
    expect((await checkRateLimit(store, "magicLink", "b")).ok).toBe(true);
    // A different action for the same id is a different bucket too.
    expect((await checkRateLimit(store, "explainForce", "a")).ok).toBe(true);
  });

  it("fails open when the store errors — a Redis blip never blocks the endpoint", async () => {
    const boom: RateStore = {
      async incr() {
        throw new Error("redis down");
      },
    };
    const v = await checkRateLimit(boom, "explainMiss", "u");
    expect(v.ok).toBe(true);
  });

  const boom: RateStore = {
    async incr() {
      throw new Error("redis down");
    },
  };

  it("fails CLOSED for the magic link — Redis down never means unlimited e-mail", async () => {
    expect(FAIL_CLOSED.has("magicLink")).toBe(true);
    const v = await checkRateLimit(boom, "magicLink", "email:a@b.c");
    expect(v).toEqual({ ok: false, remaining: 0, retryAfterSeconds: STORE_DOWN_RETRY_SECONDS });
  });

  it("only the magic link fails closed by default", async () => {
    expect([...FAIL_CLOSED]).toEqual(["magicLink"]);
    for (const action of Object.keys(RATE_LIMITS) as (keyof typeof RATE_LIMITS)[]) {
      if (action === "magicLink") continue;
      expect((await checkRateLimit(boom, action, "u")).ok).toBe(true);
    }
  });

  it("lets a caller override the failure mode per call", async () => {
    expect((await checkRateLimit(boom, "explainMiss", "u", { failClosed: true })).ok).toBe(false);
    expect((await checkRateLimit(boom, "magicLink", "u", { failClosed: false })).ok).toBe(true);
  });

  it("a healthy store still counts normally for a fail-closed action", async () => {
    const store = new MemStore();
    expect((await checkRateLimit(store, "magicLink", "x")).ok).toBe(true);
  });
});
