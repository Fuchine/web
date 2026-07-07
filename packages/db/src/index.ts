// Public surface of @fuchine/db: schema (tables + relations + inferred types),
// jsonb payload types, and the client factory.

export * from "./schema";
export * from "./types";
export { createDb, type Database, type Transaction, type DbOrTx } from "./client";
export { ensureUserSettings } from "./provisioning";
