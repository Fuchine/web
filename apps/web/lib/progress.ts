// Study-activity writers (watch time, seen lines, word stats). These are the
// writers for user_daily_stats / user_word_stats that the stats and dictionary
// read sides were waiting on. Auth-agnostic and testable; routes add auth.

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type Database,
  type DbOrTx,
  type Token,
  subtitleLines,
  userDailyStats,
  userWordStats,
  wordEntries,
} from "@fuchine/db";
import { dayKey } from "./stats";

export type Result = { status: number; body: Record<string, unknown> };

// Per-beacon caps: the player flushes every ~15s, so 10 min of watch time or
// 500 lines in one beacon means a bug or abuse, not studying.
const MS_WATCHED_MAX = 600_000;
const LINE_IDS_MAX = 500;

export type ProgressInput = { msWatched: number; lineIds: string[] };

/** Validate a progress beacon. At least one of msWatched/lineIds must be present. */
export function parseProgressInput(
  body: unknown,
): { ok: true; value: ProgressInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  let msWatched = 0;
  if (b.msWatched !== undefined) {
    if (typeof b.msWatched !== "number" || !Number.isInteger(b.msWatched) || b.msWatched < 0) {
      return { ok: false, error: "msWatched must be a non-negative integer" };
    }
    if (b.msWatched > MS_WATCHED_MAX) {
      return { ok: false, error: `msWatched must be at most ${MS_WATCHED_MAX}` };
    }
    msWatched = b.msWatched;
  }

  let lineIds: string[] = [];
  if (b.lineIds !== undefined) {
    if (!Array.isArray(b.lineIds) || b.lineIds.some((id) => typeof id !== "string" || !id)) {
      return { ok: false, error: "lineIds must be an array of ids" };
    }
    if (b.lineIds.length > LINE_IDS_MAX) {
      return { ok: false, error: `lineIds must have at most ${LINE_IDS_MAX} entries` };
    }
    lineIds = [...new Set(b.lineIds as string[])];
  }

  if (msWatched === 0 && lineIds.length === 0) {
    return { ok: false, error: "nothing to record" };
  }
  return { ok: true, value: { msWatched, lineIds } };
}

/** Occurrences per dictionary word across the given lines' tokens. */
export function countWordOccurrences(tokenLists: Token[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tokens of tokenLists) {
    for (const t of tokens) {
      if (!t.wordEntryId) continue;
      counts.set(t.wordEntryId, (counts.get(t.wordEntryId) ?? 0) + 1);
    }
  }
  return counts;
}

/** Increment today's row in user_daily_stats (one row per user per day). */
export async function bumpDailyStats(
  db: DbOrTx,
  userId: string,
  bump: { msWatched?: number; linesSeen?: number; cardsCreated?: number; reviewsDone?: number },
): Promise<void> {
  await db
    .insert(userDailyStats)
    .values({
      userId,
      day: dayKey(new Date()),
      msWatched: bump.msWatched ?? 0,
      linesSeen: bump.linesSeen ?? 0,
      cardsCreated: bump.cardsCreated ?? 0,
      reviewsDone: bump.reviewsDone ?? 0,
    })
    .onConflictDoUpdate({
      target: [userDailyStats.userId, userDailyStats.day],
      set: {
        msWatched: sql`${userDailyStats.msWatched} + excluded.ms_watched`,
        linesSeen: sql`${userDailyStats.linesSeen} + excluded.lines_seen`,
        cardsCreated: sql`${userDailyStats.cardsCreated} + excluded.cards_created`,
        reviewsDone: sql`${userDailyStats.reviewsDone} + excluded.reviews_done`,
      },
    });
}

/** Add view counts for words the user just saw in subtitle lines. */
export async function bumpWordViews(
  db: Database,
  userId: string,
  counts: Map<string, number>,
): Promise<void> {
  if (counts.size === 0) return;
  await db
    .insert(userWordStats)
    .values([...counts].map(([wordEntryId, views]) => ({ userId, wordEntryId, views })))
    .onConflictDoUpdate({
      target: [userWordStats.userId, userWordStats.wordEntryId],
      set: {
        views: sql`${userWordStats.views} + excluded.views`,
        updatedAt: new Date(),
      },
    });
}

/** Count a review against every dictionary word in the reviewed sentence. */
export async function bumpWordReviews(
  db: DbOrTx,
  userId: string,
  wordEntryIds: string[],
  ok: boolean,
): Promise<void> {
  const unique = [...new Set(wordEntryIds)];
  if (unique.length === 0) return;
  await db
    .insert(userWordStats)
    .values(unique.map((wordEntryId) => ({
      userId, wordEntryId, reviewsTotal: 1, reviewsOk: ok ? 1 : 0,
    })))
    .onConflictDoUpdate({
      target: [userWordStats.userId, userWordStats.wordEntryId],
      set: {
        reviewsTotal: sql`${userWordStats.reviewsTotal} + 1`,
        reviewsOk: sql`${userWordStats.reviewsOk} + excluded.reviews_ok`,
        updatedAt: new Date(),
      },
    });
}

/** Record a progress beacon: watch time + which lines were seen. */
export async function recordProgress(
  db: Database,
  userId: string,
  videoId: string,
  body: unknown,
): Promise<Result> {
  const parsed = parseProgressInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { msWatched, lineIds } = parsed.value;

  // Only lines that actually belong to this video count (ids are client-sent).
  const lines = lineIds.length > 0
    ? await db
        .select({ id: subtitleLines.id, tokens: subtitleLines.tokens })
        .from(subtitleLines)
        .where(and(eq(subtitleLines.videoId, videoId), inArray(subtitleLines.id, lineIds)))
    : [];

  const wordCounts = countWordOccurrences(lines.map((l) => (l.tokens as Token[]) ?? []));

  if (msWatched > 0 || lines.length > 0) {
    await bumpDailyStats(db, userId, { msWatched, linesSeen: lines.length });
  }
  await bumpWordViews(db, userId, wordCounts);

  return {
    status: 200,
    body: { recorded: true, linesCounted: lines.length, wordsCounted: wordCounts.size },
  };
}

/** Record a dictionary-popup open for a word. */
export async function recordWordClick(
  db: Database,
  userId: string,
  wordEntryId: string,
): Promise<Result> {
  const [word] = await db
    .select({ id: wordEntries.id })
    .from(wordEntries)
    .where(eq(wordEntries.id, wordEntryId))
    .limit(1);
  if (!word) return { status: 404, body: { error: "word not found" } };

  await db
    .insert(userWordStats)
    .values({ userId, wordEntryId, clicks: 1 })
    .onConflictDoUpdate({
      target: [userWordStats.userId, userWordStats.wordEntryId],
      set: {
        clicks: sql`${userWordStats.clicks} + 1`,
        updatedAt: new Date(),
      },
    });
  return { status: 200, body: { recorded: true } };
}
