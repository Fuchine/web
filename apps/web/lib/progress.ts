// Study-activity writers (watch time, seen lines, word stats). These are the
// writers for user_daily_stats / user_word_stats that the stats and dictionary
// read sides were waiting on. Auth-agnostic and testable; routes add auth.

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type Database,
  type DbOrTx,
  type Token,
  savedWords,
  subtitleLines,
  userDailyStats,
  userVideoProgress,
  userWordStats,
  videos,
  wordEntries,
} from "@fuchine/db";
import { loadKnownWordParams, signalsFromRow, wordTier } from "./known-words";
import { dayKey } from "./stats";
import { isUuid } from "./ids";
import { withTokenOverrides } from "./token-overrides";

export type Result = { status: number; body: Record<string, unknown> };

// Per-beacon caps: the player flushes every ~15s, so 10 min of watch time or
// 500 lines in one beacon means a bug or abuse, not studying.
const MS_WATCHED_MAX = 600_000;
const LINE_IDS_MAX = 500;
// Absolute daily sanity cap: a day can't hold more than 24h of watch time, so the
// accumulated total saturates here regardless of how many beacons arrive. Guards
// the streak/heatmap/watch-time numbers even without a per-user beacon rate limit
// (see backlog: stats-writers-daily-caps / ai-endpoints-no-rate-limit).
const MS_WATCHED_DAILY_MAX = 86_400_000;

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
    if (!Array.isArray(b.lineIds) || b.lineIds.some((id) => !isUuid(id))) {
      return { ok: false, error: "lineIds must be an array of uuids" };
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
        msWatched: sql`LEAST(${userDailyStats.msWatched} + excluded.ms_watched, ${MS_WATCHED_DAILY_MAX})`,
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

/**
 * Count a review against every dictionary word in the reviewed sentence, and
 * keep the known-word model's signals (T3.9): the most recent outcome
 * (last_review_ok — "confirmed" needs it true) and, on a word's first-ever
 * review, a calibration snapshot of its tier just before (first_review_tier /
 * first_review_ok — what scripts/calibrate-known-words.ts reads).
 */
export async function bumpWordReviews(
  db: DbOrTx,
  userId: string,
  wordEntryIds: string[],
  ok: boolean,
  now: Date = new Date(),
): Promise<void> {
  const unique = [...new Set(wordEntryIds)];
  if (unique.length === 0) return;

  // Pre-review tier per word (only used where this is its first review).
  const before = await db
    .select({
      wordEntryId: wordEntries.id,
      views: userWordStats.views,
      clicks: userWordStats.clicks,
      reviewsOk: userWordStats.reviewsOk,
      reviewsTotal: userWordStats.reviewsTotal,
      lastReviewOk: userWordStats.lastReviewOk,
      lastClickedAt: userWordStats.lastClickedAt,
      manual: savedWords.status,
    })
    .from(wordEntries)
    .leftJoin(userWordStats, and(eq(userWordStats.userId, userId), eq(userWordStats.wordEntryId, wordEntries.id)))
    .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, wordEntries.id)))
    .where(inArray(wordEntries.id, unique));
  // The threshold in force (calibrated, T3.10) — the snapshot must describe
  // the tier the user actually saw, or the next calibration measures a rule
  // that was never applied.
  const { likelyMinViews } = await loadKnownWordParams(db, userId);
  const tierBefore = new Map(before.map((r) => [r.wordEntryId, wordTier(signalsFromRow(r), r.manual, now, likelyMinViews)]));

  await db
    .insert(userWordStats)
    .values(unique.map((wordEntryId) => ({
      userId, wordEntryId, reviewsTotal: 1, reviewsOk: ok ? 1 : 0,
      lastReviewOk: ok, lastReviewedAt: now,
      firstReviewTier: tierBefore.get(wordEntryId) ?? "unknown", firstReviewOk: ok,
    })))
    .onConflictDoUpdate({
      target: [userWordStats.userId, userWordStats.wordEntryId],
      set: {
        reviewsTotal: sql`${userWordStats.reviewsTotal} + 1`,
        reviewsOk: sql`${userWordStats.reviewsOk} + excluded.reviews_ok`,
        lastReviewOk: sql`excluded.last_review_ok`,
        lastReviewedAt: sql`excluded.last_reviewed_at`,
        // Written once, on the word's first review (the existing row had only views/clicks).
        firstReviewTier: sql`case when ${userWordStats.reviewsTotal} = 0 then excluded.first_review_tier else ${userWordStats.firstReviewTier} end`,
        firstReviewOk: sql`case when ${userWordStats.reviewsTotal} = 0 then excluded.first_review_ok else ${userWordStats.firstReviewOk} end`,
        updatedAt: now,
      },
    });
}

/**
 * Per-(user, video) watch progress (T3.10): Explore's narrow-viewing signal
 * (channels watched recently) and "already watched" exclusion. Written only
 * for a video that exists (the id is client-sent), in one statement.
 */
export async function bumpVideoProgress(
  db: DbOrTx,
  userId: string,
  videoId: string,
  bump: { msWatched: number; linesSeen: number },
  now: Date = new Date(),
): Promise<void> {
  if (!isUuid(videoId)) return;
  await db.execute(sql`
    insert into ${userVideoProgress} ("user_id", "video_id", "ms_watched", "lines_seen", "last_watched_at")
    select ${userId}::uuid, ${videos}."id", ${bump.msWatched}::int, ${bump.linesSeen}::int, ${now.toISOString()}::timestamptz
    from ${videos} where ${videos}."id" = ${videoId}::uuid
    on conflict ("user_id", "video_id") do update set
      "ms_watched" = least(${userVideoProgress}."ms_watched"::bigint + excluded."ms_watched", 2000000000)::int,
      "lines_seen" = ${userVideoProgress}."lines_seen" + excluded."lines_seen",
      "last_watched_at" = excluded."last_watched_at"
  `);
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
  const shared = lineIds.length > 0
    ? await db
        .select({ id: subtitleLines.id, tokens: subtitleLines.tokens })
        .from(subtitleLines)
        .where(and(eq(subtitleLines.videoId, videoId), inArray(subtitleLines.id, lineIds)))
    : [];
  // Views go to the words as this user sees them (T3.7 corrections); stats
  // recorded before a correction are not rewritten.
  const lines = await withTokenOverrides(db, userId, shared, (l) => l.id);

  const wordCounts = countWordOccurrences(lines.map((l) => l.tokens));

  if (msWatched > 0 || lines.length > 0) {
    await bumpDailyStats(db, userId, { msWatched, linesSeen: lines.length });
  }
  await bumpWordViews(db, userId, wordCounts);
  await bumpVideoProgress(db, userId, videoId, { msWatched, linesSeen: lines.length });

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
    // A lookup is evidence the word wasn't known just now: it demotes
    // "likely" for LOOKUP_DECAY_DAYS (lib/known-words).
    .values({ userId, wordEntryId, clicks: 1, lastClickedAt: new Date() })
    .onConflictDoUpdate({
      target: [userWordStats.userId, userWordStats.wordEntryId],
      set: {
        clicks: sql`${userWordStats.clicks} + 1`,
        lastClickedAt: sql`excluded.last_clicked_at`,
        updatedAt: new Date(),
      },
    });
  return { status: 200, body: { recorded: true } };
}
