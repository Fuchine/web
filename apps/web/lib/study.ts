// Study read-side queries (F1). Auth-agnostic and testable; routes add auth.

import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  type Database,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  wordExamples,
  userWordStats,
} from "@fuchine/db";

/** Library: videos with their line count, newest first (paginated). */
export async function listVideos(
  db: Database,
  opts: { limit?: number; cursor?: string } = {},
) {
  const limit = opts.limit ?? 24;
  const pageConditions = [];
  if (opts.cursor) {
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
      levelEstimate: videos.levelEstimate,
      embeddable: videos.embeddable,
      category: videos.category,
      createdAt: videos.createdAt,
      lineCount: sql<number>`(SELECT count(*)::int FROM ${subtitleLines} WHERE ${subtitleLines.videoId} = ${videos.id})`,
    })
    .from(videos)
    .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
    .orderBy(desc(videos.createdAt), desc(videos.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? `t:${last.createdAt.getTime()}:${last.id}`
    : null;

  return { items, nextCursor };
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
