import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import {
  createRequestRedis,
  WORKER_HEARTBEAT_KEY,
} from "@fuchine/jobs";
import { db } from "@/lib/db";

// GET /api/health — unauthenticated, cheap liveness probe for compose /
// proxy / uptime monitors. Confirms Postgres and Redis are reachable and
// reports whether the import worker is renewing its heartbeat.
//
// 200 when Postgres and Redis are both up (the request path can serve), 503
// otherwise. `workerAlive` is informational: a dead worker doesn't fail the
// web probe, but the import UI can warn "processing is delayed" instead of
// spinning forever.

export const dynamic = "force-dynamic";

// Bound each check so a hung dependency can't hang the probe.
const CHECK_TIMEOUT_MS = 1_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timeout`)), CHECK_TIMEOUT_MS),
  );
  return Promise.race([p, timeout]);
}

async function checkDb(): Promise<boolean> {
  try {
    await withTimeout(db.execute(sql`SELECT 1`), "db");
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<{ redis: boolean; workerAlive: boolean }> {
  const redis = createRequestRedis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
  );
  try {
    // This connection is lazyConnect + enableOfflineQueue:false (tuned for the
    // fail-open request path), so a command issued before the socket is up gets
    // rejected. Connect explicitly first so the probe actually tests reachability.
    await withTimeout(redis.connect(), "redis connect");
    await withTimeout(redis.ping(), "redis");
    const exists = await withTimeout(
      redis.exists(WORKER_HEARTBEAT_KEY),
      "worker heartbeat",
    );
    return { redis: true, workerAlive: exists === 1 };
  } catch {
    return { redis: false, workerAlive: false };
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  const [dbOk, redisState] = await Promise.all([checkDb(), checkRedis()]);
  const ok = dbOk && redisState.redis;
  return NextResponse.json(
    {
      ok,
      db: dbOk,
      redis: redisState.redis,
      workerAlive: redisState.workerAlive,
    },
    { status: ok ? 200 : 503 },
  );
}
