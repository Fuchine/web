// Mining + SRS review (F1, T1.6/T1.7). Auth-agnostic and testable.

import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { type Database, sentenceCards, subtitleLines, videos, reviewLogs, wordEntries, userSettings, type Token, type Definition } from "@fuchine/db";
import { newCardState, reviewCard, previewIntervals, type CardState, type ReviewGrade } from "@fuchine/core";
import { bumpDailyStats, bumpWordReviews } from "./progress";

export type Result = { status: number; body: Record<string, unknown> };

/** Reconstruct the FSRS CardState from a sentence_cards row. */
function stateOf(c: {
  stability: number; difficulty: number; due: Date; lastReview: Date | null;
  state: number; reps: number; lapses: number; elapsedDays: number; scheduledDays: number;
}): CardState {
  return {
    stability: c.stability, difficulty: c.difficulty, due: c.due, lastReview: c.lastReview,
    state: c.state, reps: c.reps, lapses: c.lapses, elapsedDays: c.elapsedDays, scheduledDays: c.scheduledDays,
  };
}

/** Mine a subtitle line into a review card. Deduped per (user, line, type). */
export async function mineSentence(
  db: Database,
  userId: string,
  body: { subtitleLineId?: string; cardType?: string; notes?: string },
): Promise<Result> {
  if (!body?.subtitleLineId) return { status: 400, body: { error: "subtitleLineId is required" } };
  const cardType = body.cardType?.trim() || "listening";

  const [line] = await db
    .select({ id: subtitleLines.id, videoId: subtitleLines.videoId })
    .from(subtitleLines)
    .where(eq(subtitleLines.id, body.subtitleLineId))
    .limit(1);
  if (!line) return { status: 404, body: { error: "subtitle line not found" } };

  const init = newCardState();
  const inserted = await db
    .insert(sentenceCards)
    .values({
      userId, subtitleLineId: line.id, videoId: line.videoId, cardType, notes: body.notes ?? null,
      stability: init.stability, difficulty: init.difficulty, due: init.due, state: init.state,
      reps: init.reps, lapses: init.lapses, elapsedDays: init.elapsedDays, scheduledDays: init.scheduledDays,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    await bumpDailyStats(db, userId, { cardsCreated: 1 });
    return { status: 201, body: { card: inserted[0], created: true } };
  }

  // Already mined — return the existing card so the UI can offer to view it.
  const [existing] = await db
    .select()
    .from(sentenceCards)
    .where(and(
      eq(sentenceCards.userId, userId),
      eq(sentenceCards.subtitleLineId, line.id),
      eq(sentenceCards.cardType, cardType),
    ))
    .limit(1);
  return { status: 200, body: { card: existing, created: false } };
}

/** Local midnight today, for counting per-day introductions. */
function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * How many new cards (state 0) the user may still introduce today, honoring the
 * `newCardsPerDay` daily goal. Returns null when no goal is set (unlimited).
 * A new card produces exactly one review_logs row with state=0 (the state
 * before its first review), so counting today's state=0 logs = introductions.
 */
async function newCardsRemainingToday(db: Database, userId: string): Promise<number | null> {
  const [settings] = await db
    .select({ dailyGoals: userSettings.dailyGoals })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const cap = settings?.dailyGoals?.newCardsPerDay;
  if (cap == null) return null;

  const [introduced] = await db
    .select({ n: sql<number>`count(distinct ${reviewLogs.cardId})` })
    .from(reviewLogs)
    .where(
      and(
        eq(reviewLogs.userId, userId),
        eq(reviewLogs.state, 0),
        gte(reviewLogs.reviewedAt, startOfToday()),
      ),
    );
  return Math.max(0, cap - Number(introduced?.n ?? 0));
}

const QUEUE_COLUMNS = {
  cardId: sentenceCards.id, videoId: sentenceCards.videoId, cardType: sentenceCards.cardType,
  notes: sentenceCards.notes, due: sentenceCards.due,
  stability: sentenceCards.stability, difficulty: sentenceCards.difficulty, lastReview: sentenceCards.lastReview,
  state: sentenceCards.state, reps: sentenceCards.reps, lapses: sentenceCards.lapses,
  elapsedDays: sentenceCards.elapsedDays, scheduledDays: sentenceCards.scheduledDays,
  textOriginal: subtitleLines.textOriginal, textTranslation: subtitleLines.textTranslation,
  tStartMs: subtitleLines.tStartMs, tEndMs: subtitleLines.tEndMs,
  source: videos.source, sourceId: videos.sourceId,
  tokens: subtitleLines.tokens,
} as const;

/** Cards due now for the user, with the clip + sentence and preview intervals. */
export async function getReviewQueue(db: Database, userId: string, limit = 20) {
  const now = new Date();
  const remaining = await newCardsRemainingToday(db, userId);

  // Due review cards (already introduced): never throttled, oldest-due first.
  const reviewRows = await db
    .select(QUEUE_COLUMNS)
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(and(
      eq(sentenceCards.userId, userId),
      lte(sentenceCards.due, now),
      ne(sentenceCards.state, 0),
    ))
    .orderBy(asc(sentenceCards.due))
    .limit(limit);

  // Due new cards, capped by the remaining daily-new allowance (null = unlimited).
  const newCap = remaining == null ? limit : Math.min(remaining, limit);
  const newRows = newCap > 0
    ? await db
        .select(QUEUE_COLUMNS)
        .from(sentenceCards)
        .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
        .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
        .where(and(
          eq(sentenceCards.userId, userId),
          lte(sentenceCards.due, now),
          eq(sentenceCards.state, 0),
        ))
        .orderBy(asc(sentenceCards.due))
        .limit(newCap)
    : [];

  // Reviews first, then the day's allowed new cards; cap the session to `limit`.
  const rows = [...reviewRows, ...newRows].slice(0, limit);

  const allTokenRows: Token[] = rows
    .map((r) => (r.tokens as Token[]) ?? [])
    .flat();
  const uniqueIds = [...new Set(allTokenRows.map((t) => t.wordEntryId).filter(Boolean))];

  const entries =
    uniqueIds.length > 0
      ? await db
          .select({ id: wordEntries.id, reading: wordEntries.reading, lemma: wordEntries.lemma, definitions: wordEntries.definitions, pos: wordEntries.pos })
          .from(wordEntries)
          .where(inArray(wordEntries.id, uniqueIds as string[]))
      : [];

  const wordEntriesMap: Record<string, { reading: string; lemma: string; definitions: Definition[]; pos: string }> = {};
  for (const e of entries) {
    wordEntriesMap[e.id] = { reading: e.reading ?? "", lemma: e.lemma, definitions: e.definitions, pos: e.pos ?? "" };
  }

  return rows.map((r) => ({
    cardId: r.cardId,
    videoId: r.videoId,
    cardType: r.cardType,
    notes: r.notes,
    due: r.due,
    state: r.state,
    clip: { source: r.source, sourceId: r.sourceId, startMs: r.tStartMs, endMs: r.tEndMs },
    sentence: { text: r.textOriginal, translation: r.textTranslation },
    intervals: previewIntervals(stateOf(r)),
    tokens: (r.tokens as Token[]) ?? [],
    wordEntriesMap,
  }));
}

/** Apply a grade: reschedule via FSRS, persist the new state and a review log. */
export async function reviewCardById(
  db: Database,
  userId: string,
  cardId: string,
  grade: number,
): Promise<Result> {
  if (![1, 2, 3, 4].includes(grade)) {
    return { status: 400, body: { error: "grade must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)" } };
  }

  const [card] = await db
    .select()
    .from(sentenceCards)
    .where(and(eq(sentenceCards.id, cardId), eq(sentenceCards.userId, userId)))
    .limit(1);
  if (!card) return { status: 404, body: { error: "card not found" } };

  const now = new Date();
  const { card: next, log } = reviewCard(stateOf(card), grade as ReviewGrade, now);

  await db
    .update(sentenceCards)
    .set({
      stability: next.stability, difficulty: next.difficulty, due: next.due, lastReview: now,
      state: next.state, reps: next.reps, lapses: next.lapses,
      elapsedDays: next.elapsedDays, scheduledDays: next.scheduledDays,
    })
    .where(eq(sentenceCards.id, cardId));

  await db.insert(reviewLogs).values({
    cardId, userId, grade: log.grade, state: log.state, due: log.due,
    stability: log.stability, difficulty: log.difficulty,
    elapsedDays: log.elapsedDays, lastElapsedDays: log.lastElapsedDays, scheduledDays: log.scheduledDays,
  });

  // Feed the stats read-sides: daily streaks/heatmap + per-word review counts.
  await bumpDailyStats(db, userId, { reviewsDone: 1 });
  const [line] = await db
    .select({ tokens: subtitleLines.tokens })
    .from(subtitleLines)
    .where(eq(subtitleLines.id, card.subtitleLineId))
    .limit(1);
  const wordIds = ((line?.tokens as Token[]) ?? [])
    .map((t) => t.wordEntryId)
    .filter((id): id is string => !!id);
  await bumpWordReviews(db, userId, wordIds, grade >= 3);

  return { status: 200, body: { cardId, due: next.due, state: next.state, reps: next.reps } };
}
