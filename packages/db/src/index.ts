// Public surface of @fuchine/db: schema (tables + relations + inferred types),
// jsonb payload types, and the client factory.

export * from "./schema";
export * from "./types";
export { createDb, type Database, type Transaction, type DbOrTx } from "./client";
export { ensureUserSettings } from "./provisioning";
export { normalizeEmail } from "./email";
export {
  findActiveInvite,
  consumeInvite,
  addInvite,
  listInvites,
  revokeInvite,
} from "./invites";
// Known-word model + calibration + Explore's coverage materialization (T3.9/
// T3.10), shared by the web app and the worker.
export * from "./known-words";
export * from "./calibration";
export * from "./user-coverage";
export * from "./token-overrides";
