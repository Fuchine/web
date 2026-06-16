import { createDb } from "@fuchine/db";

// Single DB handle for the web app. Placeholder URL keeps `next build` from
// throwing when DATABASE_URL is absent; queries still require a real one.
export const db = createDb(
  process.env.DATABASE_URL ?? "postgres://localhost/placeholder",
);
