// Albums CRUD + membership (F2). Auth-agnostic and testable; routes add auth.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  type Database,
  albums,
  albumVideos,
  videos,
  videoWordCounts,
  userWordStats,
  savedWords,
} from "@fuchine/db";
import { coverageFromTierCounts, emptyTierCounts, loadKnownWordParams, wordTierSqlFor, type TierCounts } from "./known-words";
import { isUuid } from "./ids";

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
  words: number; // distinct countable dictionary words across the album's videos
  pct: number; // token-weighted coverage headline across the album's videos (T3.9); 0 = too few words
  coverIds: string[]; // up to 4 member video ids, for the cover mosaic
};

/**
 * Albums enriched for the grid: video count, cover member ids, and real
 * coverage (token-weighted over the album's videos, same tier model as the
 * library — lib/known-words; user token corrections are not applied to the
 * album aggregate). Pinned first, then newest.
 */
export async function listAlbumsForView(db: Database, userId: string): Promise<AlbumView[]> {
  const params = await loadKnownWordParams(db, userId);
  const wordTierSql = wordTierSqlFor(params.likelyMinViews);
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

  // Per-album tier totals (coverage): occurrences and distinct words per tier.
  // A word has one tier per user, so distinct words summed over the tiers =
  // the album's distinct words.
  const stats = await db
    .select({
      albumId: albumVideos.albumId,
      tier: wordTierSql,
      tokens: sql<number>`sum(${videoWordCounts.occurrences})::int`,
      words: sql<number>`count(distinct ${videoWordCounts.wordEntryId})::int`,
    })
    .from(albumVideos)
    .innerJoin(albums, and(eq(albums.id, albumVideos.albumId), eq(albums.userId, userId)))
    .innerJoin(videoWordCounts, eq(videoWordCounts.videoId, albumVideos.videoId))
    .leftJoin(userWordStats, and(eq(userWordStats.wordEntryId, videoWordCounts.wordEntryId), eq(userWordStats.userId, userId)))
    .leftJoin(savedWords, and(eq(savedWords.wordEntryId, videoWordCounts.wordEntryId), eq(savedWords.userId, userId)))
    .groupBy(albumVideos.albumId, wordTierSql);
  const statsByAlbum = new Map<string, TierCounts>();
  for (const r of stats) {
    const c = statsByAlbum.get(r.albumId) ?? emptyTierCounts();
    c[r.tier].tokens += Number(r.tokens);
    c[r.tier].words += Number(r.words);
    statsByAlbum.set(r.albumId, c);
  }

  return base.map((a) => {
    const c = statsByAlbum.get(a.id) ?? emptyTierCounts();
    const total = c.unknown.words + c.likely.words + c.confirmed.words;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      pinned: a.pinnedAt != null,
      videoCount: Number(a.videoCount),
      words: total,
      pct: coverageFromTierCounts(c, params.likelyWeight)?.headline ?? 0,
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
  if (!isUuid(videoId)) return { status: 400, body: { error: "videoId must be a uuid" } };

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
  if (!isUuid(videoId)) return { status: 400, body: { error: "videoId must be a uuid" } };

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
