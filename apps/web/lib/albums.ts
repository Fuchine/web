// Albums CRUD + membership (F2). Auth-agnostic and testable; routes add auth.

import { and, desc, eq, sql } from "drizzle-orm";
import { type Database, albums, albumVideos, videos } from "@fuchine/db";

export type Result = { status: number; body: Record<string, unknown> };

export type AlbumInput = { name?: string; description?: string | null };

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

/** Validate a create/update album body. `requireName` for create, not for patch. */
export function parseAlbumInput(
  body: unknown,
  opts: { requireName: boolean },
): { ok: true; value: AlbumInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const value: AlbumInput = {};

  if (b.name !== undefined) {
    if (typeof b.name !== "string") return { ok: false, error: "name must be a string" };
    const name = b.name.trim();
    if (!name) return { ok: false, error: "name must not be blank" };
    if (name.length > NAME_MAX) return { ok: false, error: `name must be at most ${NAME_MAX} characters` };
    value.name = name;
  } else if (opts.requireName) {
    return { ok: false, error: "name is required" };
  }

  if (b.description !== undefined) {
    if (typeof b.description !== "string") return { ok: false, error: "description must be a string" };
    const description = b.description.trim();
    if (description.length > DESCRIPTION_MAX) {
      return { ok: false, error: `description must be at most ${DESCRIPTION_MAX} characters` };
    }
    value.description = description || null;
  }

  return { ok: true, value };
}

/** All albums for a user with video counts, newest first. */
export async function listAlbums(db: Database, userId: string) {
  return db
    .select({
      id: albums.id,
      name: albums.name,
      description: albums.description,
      createdAt: albums.createdAt,
      pinnedAt: albums.pinnedAt,
      videoCount: sql<number>`count(${albumVideos.videoId})::int`,
    })
    .from(albums)
    .leftJoin(albumVideos, eq(albumVideos.albumId, albums.id))
    .where(eq(albums.userId, userId))
    .groupBy(albums.id)
    .orderBy(desc(albums.createdAt));
}

export async function createAlbum(db: Database, userId: string, body: unknown): Promise<Result> {
  const parsed = parseAlbumInput(body, { requireName: true });
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };

  const [album] = await db
    .insert(albums)
    .values({ userId, name: parsed.value.name!, description: parsed.value.description ?? null })
    .returning();
  return { status: 201, body: { album } };
}

export async function updateAlbum(
  db: Database,
  userId: string,
  albumId: string,
  body: unknown,
): Promise<Result> {
  const parsed = parseAlbumInput(body, { requireName: false });
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  if (parsed.value.name === undefined && parsed.value.description === undefined) {
    return { status: 400, body: { error: "nothing to update" } };
  }

  const updated = await db
    .update(albums)
    .set(parsed.value)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .returning();
  if (updated.length === 0) return { status: 404, body: { error: "album not found" } };
  return { status: 200, body: { album: updated[0] } };
}

export async function deleteAlbum(db: Database, userId: string, albumId: string): Promise<Result> {
  const deleted = await db
    .delete(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .returning({ id: albums.id });
  if (deleted.length === 0) return { status: 404, body: { error: "album not found" } };
  return { status: 200, body: { deleted: true } };
}

/** Album must belong to the user; membership is deduped by the composite PK. */
export async function addVideoToAlbum(
  db: Database,
  userId: string,
  albumId: string,
  videoId: unknown,
): Promise<Result> {
  if (typeof videoId !== "string" || !videoId) {
    return { status: 400, body: { error: "videoId is required" } };
  }

  const [album] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  if (!album) return { status: 404, body: { error: "album not found" } };

  const [video] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video) return { status: 404, body: { error: "video not found" } };

  const inserted = await db
    .insert(albumVideos)
    .values({ albumId, videoId })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return { status: 200, body: { added: false } };
  return { status: 201, body: { added: true } };
}

export async function removeVideoFromAlbum(
  db: Database,
  userId: string,
  albumId: string,
  videoId: unknown,
): Promise<Result> {
  if (typeof videoId !== "string" || !videoId) {
    return { status: 400, body: { error: "videoId is required" } };
  }

  const [album] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  if (!album) return { status: 404, body: { error: "album not found" } };

  const deleted = await db
    .delete(albumVideos)
    .where(and(eq(albumVideos.albumId, albumId), eq(albumVideos.videoId, videoId)))
    .returning({ videoId: albumVideos.videoId });
  if (deleted.length === 0) return { status: 404, body: { error: "video not in album" } };
  return { status: 200, body: { removed: true } };
}
