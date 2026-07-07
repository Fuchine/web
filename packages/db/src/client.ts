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

/**
 * Create a Drizzle database bound to the full schema.
 * Pass `process.env.DATABASE_URL` (or any Postgres connection string).
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}
