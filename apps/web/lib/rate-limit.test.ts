import { describe, it, expect } from "vitest";
import { checkRateLimit, RATE_LIMITS, type RateStore } from "./rate-limit";

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
});
