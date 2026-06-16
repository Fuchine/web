// Public surface of @fuchine/db: schema (tables + relations + inferred types),
// jsonb payload types, and the client factory.

export * from "./schema";
export * from "./types";
export { createDb, type Database } from "./client";
export { ensureUserSettings } from "./provisioning";
