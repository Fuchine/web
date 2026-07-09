// Per-user rate limiting for the endpoints that spend money on the house key or
// hammer Postgres (backlog: ai-endpoints-no-rate-limit). Fixed-window counters
// in Redis (INCR + first-hit EXPIRE), reusing the BullMQ Redis infra. Limits are
// generous — a real student never reaches them; they cap abuse and cache
// poisoning. The core is a pure function over an injectable store so it's unit
// tested without Redis; the request path fails OPEN (a limiter blip must never
// take an endpoint down).

import { createRequestRedis } from "@fuchine/jobs";

// Windows in seconds. Mirrors the reference table in the backlog item.
export const RATE_LIMITS = {
  explainMiss: { limit: 120, windowSeconds: 3_600 }, // new layer-2 generations
  explainForce: { limit: 20, windowSeconds: 86_400 }, // cache-overwriting regenerations
  translateMiss: { limit: 500, windowSeconds: 86_400 }, // new chunk translations
  importNew: { limit: 30, windowSeconds: 86_400 }, // non-cached imports
  dictionarySearch: { limit: 60, windowSeconds: 60 }, // q-search (seq scan)
  magicLink: { limit: 5, windowSeconds: 3_600 }, // per target email / IP (pre-auth)
  // Stats writers: caps fabricated watch time / clicks (backlog:
  // stats-writers-daily-caps). Denied requests return 200 + discard (not 429) so
  // the player never breaks. The player flushes every ~15s and also sends a final
  // beacon on unload — so allow a small burst (3/15s) to avoid dropping that
  // legit tail, while still bounding a scripted loop to ~12/min.
  progressBeacon: { limit: 3, windowSeconds: 15 }, // per user
  wordClick: { limit: 1, windowSeconds: 60 }, // per (user, word)
} as const;

export type RateAction = keyof typeof RATE_LIMITS;

export type RateVerdict = { ok: boolean; remaining: number; retryAfterSeconds: number };

export interface RateStore {
  /** Increment the counter at `key`, applying `windowSeconds` TTL on first hit; returns the new count. */
  incr(key: string, windowSeconds: number): Promise<number>;
}

export function rateKey(action: RateAction, id: string): string {
  return `rl:${action}:${id}`;
}

/**
 * Fixed-window check against an injectable store. Pure and testable. Fails OPEN:
 * if the store throws (Redis down/slow), the request is allowed — rate limiting
 * is a cost guard, not a correctness guard, and must not become an outage.
 */
export async function checkRateLimit(
  store: RateStore,
  action: RateAction,
  id: string,
): Promise<RateVerdict> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  let count: number;
  try {
    count = await store.incr(rateKey(action, id), windowSeconds);
  } catch {
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }
  const ok = count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ok ? 0 : windowSeconds,
  };
}

/* ----------------------------- Redis wiring ----------------------------- */

const STORE_TIMEOUT_MS = 250; // the limiter must never add more than this to a request

class RedisRateStore implements RateStore {
  constructor(private readonly redis: ReturnType<typeof createRequestRedis>) {}

  async incr(key: string, windowSeconds: number): Promise<number> {
    // Bound the wait so a slow/hung Redis can't stall the request; on timeout we
    // reject and the caller fails open.
    const run = (async () => {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds);
      return count;
    })();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("rate-limit store timeout")), STORE_TIMEOUT_MS),
    );
    return Promise.race([run, timeout]);
  }
}

let store: RateStore | null = null;

function getRateStore(): RateStore {
  if (!store) {
    store = new RedisRateStore(
      createRequestRedis(process.env.REDIS_URL ?? "redis://localhost:6379"),
    );
  }
  return store;
}

/** Enforce a limit for `action` scoped to `id` (userId, email, or IP). */
export async function enforceRateLimit(action: RateAction, id: string): Promise<RateVerdict> {
  return checkRateLimit(getRateStore(), action, id);
}

/** Standard 429 payload for a denied request. */
export function tooManyRequests(verdict: RateVerdict, message: string) {
  return {
    status: 429 as const,
    body: { error: message, retryAfterSeconds: verdict.retryAfterSeconds },
  };
}

/** Retry-After header for a `tooManyRequests` result (undefined for non-429s). */
export function retryAfterHeader(result: {
  status: number;
  body: Record<string, unknown>;
}): Record<string, string> | undefined {
  if (result.status !== 429) return undefined;
  const s = result.body.retryAfterSeconds;
  return { "Retry-After": String(typeof s === "number" ? s : 0) };
}
