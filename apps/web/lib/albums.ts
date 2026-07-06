// Albums CRUD + membership (F2). Auth-agnostic and testable; routes add auth.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  type Database,
  albums,
  albumVideos,
  videos,
  wordExamples,
  userWordStats,
} from "@fuchine/db";

export type Result = { status: number; body: Record<string, unknown> };

export type AlbumInput = { name?: string; description?: string | null; pinned?: boolean };

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

  if (b.pinned !== undefined) {
    if (typeof b.pinned !== "boolean") return { ok: false, error: "pinned must be a boolean" };
    value.pinned = b.pinned;
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

export type AlbumMembership = { id: string; name: string; videoIds: string[] };

/** Non-empty albums with their member video ids, for the library album filter. */
export async function getAlbumMemberships(db: Database, userId: string): Promise<AlbumMembership[]> {
  const rows = await db
    .select({ id: albums.id, name: albums.name, videoId: albumVideos.videoId })
    .from(albums)
    .innerJoin(albumVideos, eq(albumVideos.albumId, albums.id))
    .where(eq(albums.userId, userId))
    .orderBy(asc(albums.name));
  const byId = new Map<string, AlbumMembership>();
  for (const r of rows) {
    let a = byId.get(r.id);
    if (!a) { a = { id: r.id, name: r.name, videoIds: [] }; byId.set(r.id, a); }
    a.videoIds.push(r.videoId);
  }
  return [...byId.values()];
}

export type AlbumView = {
  id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  videoCount: number;
  words: number; // distinct dictionary words across the album's videos
  pct: number; // comprehension % (known distinct words / total)
  coverIds: string[]; // up to 4 member video ids, for the cover mosaic
};

/**
 * Albums enriched for the grid: video count, cover member ids, and real
 * comprehension (distinct known words / total distinct words across the album's
 * videos, same "known" heuristic as the library). Pinned first, then newest.
 */
export async function listAlbumsForView(db: Database, userId: string): Promise<AlbumView[]> {
  const base = await db
    .select({
      id: albums.id,
      name: albums.name,
      description: albums.description,
      pinnedAt: albums.pinnedAt,
      createdAt: albums.createdAt,
      videoCount: sql<number>`count(${albumVideos.videoId})::int`,
      coverIds: sql<string[]>`coalesce(array_agg(${albumVideos.videoId} order by ${albumVideos.addedAt}) filter (where ${albumVideos.videoId} is not null), '{}')`,
    })
    .from(albums)
    .leftJoin(albumVideos, eq(albumVideos.albumId, albums.id))
    .where(eq(albums.userId, userId))
    .groupBy(albums.id)
    .orderBy(desc(albums.pinnedAt), desc(albums.createdAt));

  // Per-album distinct-word totals + known count (comprehension).
  const stats = await db
    .select({
      albumId: albumVideos.albumId,
      total: sql<number>`count(distinct ${wordExamples.wordEntryId})::int`,
      known: sql<number>`count(distinct ${wordExamples.wordEntryId}) filter (where ${userWordStats.reviewsOk} >= 1 or ${userWordStats.views} >= 5)::int`,
    })
    .from(albumVideos)
    .innerJoin(albums, and(eq(albums.id, albumVideos.albumId), eq(albums.userId, userId)))
    .innerJoin(wordExamples, eq(wordExamples.videoId, albumVideos.videoId))
    .leftJoin(
      userWordStats,
      and(eq(userWordStats.wordEntryId, wordExamples.wordEntryId), eq(userWordStats.userId, userId)),
    )
    .groupBy(albumVideos.albumId);
  const statsByAlbum = new Map(stats.map((s) => [s.albumId, s]));

  return base.map((a) => {
    const s = statsByAlbum.get(a.id);
    const total = Number(s?.total ?? 0);
    const known = Number(s?.known ?? 0);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      pinned: a.pinnedAt != null,
      videoCount: Number(a.videoCount),
      words: total,
      pct: total ? Math.round((known / total) * 100) : 0,
      coverIds: (a.coverIds ?? []).slice(0, 4),
    };
  });
}

export type AlbumDetailVideo = {
  id: string;
  title: string;
  channel: string | null;
  durationS: number | null;
  levelEstimate: "beginner" | "intermediate" | "advanced" | null;
  source: string;
  sourceId: string;
};

export type AlbumDetail = {
  id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  videos: AlbumDetailVideo[];
};

/** One album (owned by the user) with its videos in album order, or null. */
export async function getAlbumDetail(
  db: Database,
  userId: string,
  albumId: string,
): Promise<AlbumDetail | null> {
  const [album] = await db
    .select({ id: albums.id, name: albums.name, description: albums.description, pinnedAt: albums.pinnedAt })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  if (!album) return null;

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      channel: videos.channel,
      durationS: videos.durationS,
      levelEstimate: videos.levelEstimate,
      source: videos.source,
      sourceId: videos.sourceId,
    })
    .from(albumVideos)
    .innerJoin(videos, eq(videos.id, albumVideos.videoId))
    .where(eq(albumVideos.albumId, albumId))
    .orderBy(asc(albumVideos.addedAt));

  return {
    id: album.id,
    name: album.name,
    description: album.description,
    pinned: album.pinnedAt != null,
    videos: rows,
  };
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
  const { name, description, pinned } = parsed.value;
  if (name === undefined && description === undefined && pinned === undefined) {
    return { status: 400, body: { error: "nothing to update" } };
  }

  const set: Partial<typeof albums.$inferInsert> = {};
  if (name !== undefined) set.name = name;
  if (description !== undefined) set.description = description;
  if (pinned !== undefined) set.pinnedAt = pinned ? new Date() : null;

  const updated = await db
    .update(albums)
    .set(set)
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
