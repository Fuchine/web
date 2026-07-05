/**
 * End-to-end test for albums (F2). Runs the REAL lib functions
 * (listAlbums / createAlbum / updateAlbum / deleteAlbum / addVideoToAlbum /
 * removeVideoFromAlbum) against a live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-albums.ts
 */
import { createDb, users, videos, type Database } from "@fuchine/db";
import { eq } from "drizzle-orm";
import {
  listAlbums, createAlbum, updateAlbum, deleteAlbum,
  addVideoToAlbum, removeVideoFromAlbum,
} from "../lib/albums";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

async function main() {
  console.log("\n=== E2E: albums ===\n");

  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `e2e-albums-${stamp}@example.com` }).returning();
  const [stranger] = await db.insert(users).values({ email: `e2e-albums-stranger-${stamp}@example.com` }).returning();
  const [video] = await db
    .insert(videos)
    .values({ sourceId: `e2e-albums-${stamp}`, url: "https://youtube.com/watch?v=e2e", title: "E2E video" })
    .returning();

  check("starts empty", (await listAlbums(db, user.id)).length === 0);

  // Create
  const created = await createAlbum(db, user.id, { name: "  Cooking vlogs  ", description: " comfort food " });
  check("create returns 201 with trimmed fields", created.status === 201, created);
  const album = (created.body as { album: { id: string; name: string; description: string | null } }).album;
  check("name and description are trimmed", album.name === "Cooking vlogs" && album.description === "comfort food", album);
  check("create rejects a blank name (400)", (await createAlbum(db, user.id, { name: "  " })).status === 400);

  // List with counts
  let listed = await listAlbums(db, user.id);
  check("list shows the album with zero videos", listed.length === 1 && listed[0].videoCount === 0, listed);
  check("stranger sees no albums", (await listAlbums(db, stranger.id)).length === 0);

  // Membership
  const add = await addVideoToAlbum(db, user.id, album.id, video.id);
  check("add video returns 201 added:true", add.status === 201 && add.body.added === true, add);
  const readd = await addVideoToAlbum(db, user.id, album.id, video.id);
  check("re-add is deduped (200 added:false)", readd.status === 200 && readd.body.added === false, readd);
  listed = await listAlbums(db, user.id);
  check("video count reflects membership", listed[0].videoCount === 1, listed);
  check("add to someone else's album is 404", (await addVideoToAlbum(db, stranger.id, album.id, video.id)).status === 404);
  check("add a missing video is 404", (await addVideoToAlbum(db, user.id, album.id, crypto.randomUUID())).status === 404);
  check("add without videoId is 400", (await addVideoToAlbum(db, user.id, album.id, undefined)).status === 400);

  // Update
  const renamed = await updateAlbum(db, user.id, album.id, { name: "Cozy cooking" });
  check("rename returns 200", renamed.status === 200 && (renamed.body as { album: { name: string } }).album.name === "Cozy cooking", renamed);
  check("update by stranger is 404", (await updateAlbum(db, stranger.id, album.id, { name: "hijack" })).status === 404);
  check("empty update is 400", (await updateAlbum(db, user.id, album.id, {})).status === 400);

  // Remove membership
  const removed = await removeVideoFromAlbum(db, user.id, album.id, video.id);
  check("remove video returns 200", removed.status === 200, removed);
  check("remove again is 404 (not in album)", (await removeVideoFromAlbum(db, user.id, album.id, video.id)).status === 404);
  check("count back to zero", (await listAlbums(db, user.id))[0].videoCount === 0);

  // Delete
  check("delete by stranger is 404", (await deleteAlbum(db, stranger.id, album.id)).status === 404);
  check("delete returns 200", (await deleteAlbum(db, user.id, album.id)).status === 200);
  check("list is empty after delete", (await listAlbums(db, user.id)).length === 0);

  // Cleanup (user cascade removes albums; video row is shared-cache style, delete explicitly).
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(users).where(eq(users.id, stranger.id));
  await db.delete(videos).where(eq(videos.id, video.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => { console.error("E2E crashed:", err); await closeDb(); process.exit(1); });
