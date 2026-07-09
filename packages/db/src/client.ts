// Drizzle client factory (postgres-js driver).
// One place creates the connection so apps/worker share the same wiring.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** The transaction handle Drizzle hands to `db.transaction(async (tx) => …)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Accepts either the pooled db or an open transaction — for helpers that must
 *  run inside a caller's transaction as well as standalone. */
export type DbOrTx = Database | Transaction;

/** Connection-pool knobs. Defaults match postgres.js's own (max 10). */
export interface PoolOptions {
  /** Max connections in the pool. Budget across processes below `max_connections`. */
  max?: number;
  /** Seconds a connection may sit idle before it's closed. */
  idleTimeout?: number;
}

/**
 * Create a Drizzle database bound to the full schema.
 * Pass `process.env.DATABASE_URL` (or any Postgres connection string).
 *
 * The pool is a shared resource: web (`next start`) and the worker each open
 * their own pool against the same Postgres, plus any backfill/seed script. Size
 * `max` so their sum stays under the server's `max_connections`. See the
 * production notes in `docs/DEPLOY_CHECKLIST.md`.
 */
export function createDb(connectionString: string, opts: PoolOptions = {}) {
  const client = postgres(connectionString, {
    prepare: false,
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
  });
  return drizzle(client, { schema });
}
