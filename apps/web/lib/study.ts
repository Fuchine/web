// Study read-side queries (F1). Auth-agnostic and testable; routes add auth.

import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import {
  type Database,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  wordExamples,
  userWordStats,
} from "@fuchine/db";

/** Library: every video with its line count, newest first. */
export async function listVideos(db: Database) {
  return db
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
      createdAt: videos.createdAt,
      lineCount: count(subtitleLines.id),
    })
    .from(videos)
    .leftJoin(subtitleLines, eq(subtitleLines.videoId, videos.id))
    .groupBy(videos.id) // PK groups all video columns (functional dependency)
    .orderBy(desc(videos.createdAt));
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
 */
export async function getComprehensionByVideo(
  db: Database,
  userId: string,
): Promise<Map<string, number>> {
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
