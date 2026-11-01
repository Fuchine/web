// Route-id validation (C2). Every entity id is a Postgres `uuid`; passing any
// other string to a query makes Postgres raise "invalid input syntax for type
// uuid", which surfaced as an unhandled 500 (log noise, error-based probing).
// Routes check ids up front and answer 404 (path ids) or 400 (body/query ids).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the canonical 8-4-4-4-12 hex form (any version). */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
