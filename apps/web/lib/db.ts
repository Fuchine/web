import { createDb } from "@fuchine/db";

// Single DB handle for the web app. Placeholder URL keeps `next build` from
// throwing when DATABASE_URL is absent; queries still require a real one.
// Pool size is a knob (DB_POOL_MAX, default 10) so web + worker + scripts can be
// budgeted under Postgres' max_connections.
export const db = createDb(
  process.env.DATABASE_URL ?? "postgres://localhost/placeholder",
  { max: Number(process.env.DB_POOL_MAX) || 10 },
);
