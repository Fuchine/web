// Study read-side queries (F1). Auth-agnostic and testable; routes add auth.

import { asc, count, desc, eq } from "drizzle-orm";
import { type Database, videos, subtitleLines } from "@fuchine/db";

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

  return { video, lines };
}
