// Study read-side queries (F1). Auth-agnostic and testable; routes add auth.

import { and, asc, count, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import {
  type Database,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  wordExamples,
  userWordStats,
} from "@fuchine/db";
import { decodeListCursor, encodeListCursor, escapeLike } from "./list-query";
import { LEVEL } from "./library";

// Nulls sort last: videos without a duration on "shortest first", without a
// level estimate on "level". The level bands mirror LEVEL in lib/library.ts.
const DURATION_NULL = 2147483647;
const LEVEL_NULL = 99;

export const VIDEO_SORTS = ["newest", "short", "level"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

/**
 * Library: videos with their line count (paginated). Search, category filter
 * and sort run here, over the whole catalog — the client's infinite scroll
 * only ever sees pages that already match. "Most comprehensible" is NOT a
 * server sort: comprehension is a per-user aggregate over word_examples
 * (catalog-sized, D3), and ordering by it would recompute it for every video
 * on every page; the client keeps that ordering over loaded pages.
 * `total` (count under the same filters) comes only with the first page.
 */
export async function listVideos(
  db: Database,
  opts: {
    limit?: number;
    cursor?: string;
    q?: string;
    category?: string;
    sort?: VideoSort;
  } = {},
) {
  const limit = opts.limit ?? 24;
  const sort: VideoSort = opts.sort ?? "newest";

  const filters: SQL[] = [];
  const q = opts.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(videos.title, pattern), ilike(videos.channel, pattern))!);
  }
  if (opts.category) filters.push(eq(videos.category, opts.category));

  // Constants go in as raw literals, not bind params: a CASE whose branches
  // are all untyped parameters leaves Postgres unable to infer its type.
  const durationKey = sql<number>`coalesce(${videos.durationS}, ${sql.raw(String(DURATION_NULL))})`;
  const levelKey = sql<number>`case when ${videos.levelEstimate} = 'beginner' then ${sql.raw(String(LEVEL.beginner))} when ${videos.levelEstimate} = 'intermediate' then ${sql.raw(String(LEVEL.intermediate))} when ${videos.levelEstimate} = 'advanced' then ${sql.raw(String(LEVEL.advanced))} else ${sql.raw(String(LEVEL_NULL))} end`;
  const sortKey = sort === "short" ? durationKey : sort === "level" ? levelKey : null;

  const pageConditions = [...filters];
  if (opts.cursor) {
    if (sortKey === null) {
      const parts = opts.cursor.split(":");
      const ts = parseInt(parts[1] ?? "", 10);
      const id = parts.slice(2).join(":");
      if (!isNaN(ts) && id) {
        pageConditions.push(
          or(
            lt(videos.createdAt, new Date(ts)),
            and(eq(videos.createdAt, new Date(ts)), lt(videos.id, id)),
          )!,
        );
      }
    } else {
      const cur = decodeListCursor(opts.cursor);
      const v = typeof cur?.[0] === "number" ? cur[0] : null;
      const id = typeof cur?.[1] === "string" ? cur[1] : null;
      if (v !== null && id) {
        pageConditions.push(
          or(sql`${sortKey} > ${v}`, and(sql`${sortKey} = ${v}`, lt(videos.id, id)))!,
        );
      }
    }
  }

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      channel: videos.channel,
      source: videos.source,
      sourceId: videos.sourceId,
      durationS: videos.durationS,
      language: videos.language,
      status: videos.status,
      statusReason: videos.statusReason,
      levelEstimate: videos.levelEstimate,
      embeddable: videos.embeddable,
      category: videos.category,
      createdAt: videos.createdAt,
      lineCount: sql<number>`(SELECT count(*)::int FROM ${subtitleLines} WHERE ${subtitleLines.videoId} = ${videos.id})`,
    })
    .from(videos)
    .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
    .orderBy(
      ...(sortKey === null
        ? [desc(videos.createdAt), desc(videos.id)]
        : [asc(sortKey), desc(videos.id)]),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      sort === "short"
        ? encodeListCursor([last.durationS ?? DURATION_NULL, last.id])
        : sort === "level"
          ? encodeListCursor([LEVEL[last.levelEstimate ?? ""] ?? LEVEL_NULL, last.id])
          : `t:${last.createdAt.getTime()}:${last.id}`;
  }

  let total: number | undefined;
  if (!opts.cursor) {
    const [row] = await db
      .select({ n: count() })
      .from(videos)
      .where(filters.length > 0 ? and(...filters) : undefined);
    total = row?.n ?? 0;
  }

  return { items, nextCursor, total };
}

/** Dashboard "Continue watching": the newest video only, without the line-count join. */
export async function getLatestVideo(db: Database) {
  const [row] = await db
    .select({
      id: videos.id,
      title: videos.title,
      channel: videos.channel,
      source: videos.source,
      sourceId: videos.sourceId,
      durationS: videos.durationS,
    })
    .from(videos)
    .orderBy(desc(videos.createdAt))
    .limit(1);
  return row ?? null;
}

// "Known" heuristic v1: the user answered a review containing the word
// correctly at least once, or has seen it in this many subtitle lines.
const KNOWN_MIN_VIEWS = 5;
// Below this many distinct dictionary words the percentage is noise.
const COMPREHENSION_MIN_WORDS = 10;

/**
 * Distinct-word comprehension % per video for a user, from word_examples
 * (written at import) joined with user_word_stats (written by the player and
 * review beacons). Videos with too few words are omitted (UI shows nothing).
 *
 * Pass `videoIds` (the ones actually being rendered) to scope the aggregate to
 * those videos — `word_examples` is catalog-sized (shared cache, D3), so the
 * unscoped GROUP BY grows with every video anyone imports. Both the scoped and
 * unscoped paths ride `word_examples_video_word_idx`. Empty array ⇒ empty map.
 */
export async function getComprehensionByVideo(
  db: Database,
  userId: string,
  videoIds?: string[],
): Promise<Map<string, number>> {
  if (videoIds && videoIds.length === 0) return new Map();
  const rows = await db
    .select({
      videoId: wordExamples.videoId,
      total: sql<number>`count(distinct ${wordExamples.wordEntryId})::int`,
      known: sql<number>`count(distinct ${wordExamples.wordEntryId}) filter (where ${userWordStats.reviewsOk} >= 1 or ${userWordStats.views} >= ${KNOWN_MIN_VIEWS})::int`,
    })
    .from(wordExamples)
    .leftJoin(
      userWordStats,
      and(
        eq(userWordStats.wordEntryId, wordExamples.wordEntryId),
        eq(userWordStats.userId, userId),
      ),
    )
    .where(videoIds ? inArray(wordExamples.videoId, videoIds) : undefined)
    .groupBy(wordExamples.videoId);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.total >= COMPREHENSION_MIN_WORDS) {
      map.set(r.videoId, Math.round((100 * r.known) / r.total));
    }
  }
  return map;
}

/** Player payload: the video plus its ordered subtitle lines (tokens included). */
export async function getVideoWithLines(db: Database, videoId: string) {
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video) return null;

  const lines = await db
    .select({
      id: subtitleLines.id,
      idx: subtitleLines.idx,
      tStartMs: subtitleLines.tStartMs,
      tEndMs: subtitleLines.tEndMs,
      textOriginal: subtitleLines.textOriginal,
      textTranslation: subtitleLines.textTranslation,
      tokens: subtitleLines.tokens,
    })
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, videoId))
    .orderBy(asc(subtitleLines.idx));

  const chunks = await db
    .select({ chunkIdx: subtitleTranslationChunks.chunkIdx })
    .from(subtitleTranslationChunks)
    .where(eq(subtitleTranslationChunks.videoId, videoId));

  return { video, lines, translatedChunks: chunks.map((c) => c.chunkIdx) };
}
