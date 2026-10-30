// Mining + SRS review (F1, T1.6/T1.7). Auth-agnostic and testable.

import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { type Database, sentenceCards, subtitleLines, videos, reviewLogs, wordEntries, userSettings, type Token, type Definition } from "@fuchine/db";
import { newCardState, type FsrsService, type ReviewGrade } from "@fuchine/core";
import { cardStateOf, loadUserFsrs, rebuildMemory } from "./fsrs";
import { bumpDailyStats, bumpWordReviews } from "./progress";
import { effectiveNewCardsPerDay } from "./srs-defaults";
import { loadTokenOverrides, withTokenOverrides, correctLine } from "./token-overrides";

export type Result = { status: number; body: Record<string, unknown> };

/** Card types the API accepts. Only "listening" exists today; extend here. */
export const CARD_TYPES = ["listening"] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** Upper bound for a card's free-text notes (B1: no unbounded writes). */
export const MAX_NOTES_LENGTH = 2000;

/**
 * Validate optional `notes`: absent/null is fine; otherwise a string of at
 * most MAX_NOTES_LENGTH characters. Returns an error message or null.
 */
export function validateNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null) return null;
  if (typeof notes !== "string") return "notes must be a string";
  if (notes.length > MAX_NOTES_LENGTH) return `notes must be at most ${MAX_NOTES_LENGTH} characters`;
  return null;
}

/**
 * Resolve an optional `cardType` against the allowlist (absent/blank →
 * "listening"). Returns the type, or an error message.
 */
export function parseCardType(raw: unknown): { cardType: CardType } | { error: string } {
  if (raw === undefined || raw === null) return { cardType: "listening" };
  if (typeof raw !== "string") return { error: "cardType must be a string" };
  const t = raw.trim() || "listening";
  return (CARD_TYPES as readonly string[]).includes(t)
    ? { cardType: t as CardType }
    : { error: `cardType must be one of: ${CARD_TYPES.join(", ")}` };
}

/** Mine a subtitle line into a review card. Deduped per (user, line, type). */
export async function mineSentence(
  db: Database,
  userId: string,
  body: { subtitleLineId?: unknown; cardType?: unknown; notes?: unknown },
): Promise<Result> {
  if (!body?.subtitleLineId || typeof body.subtitleLineId !== "string") {
    return { status: 400, body: { error: "subtitleLineId is required" } };
  }
  const parsedType = parseCardType(body.cardType);
  if ("error" in parsedType) return { status: 400, body: { error: parsedType.error } };
  const { cardType } = parsedType;
  const notesError = validateNotes(body.notes);
  if (notesError) return { status: 400, body: { error: notesError } };
  const notes = (body.notes as string | null | undefined) ?? null;

  const [line] = await db
    .select({ id: subtitleLines.id, videoId: subtitleLines.videoId })
    .from(subtitleLines)
    .where(eq(subtitleLines.id, body.subtitleLineId))
    .limit(1);
  if (!line) return { status: 404, body: { error: "subtitle line not found" } };

  const init = newCardState();
  // Insert the card and bump the daily counter atomically: a card without its
  // cards_created bump (or vice-versa) would skew streaks/stats.
  const inserted = await db.transaction(async (tx) => {
    const ins = await tx
      .insert(sentenceCards)
      .values({
        userId, subtitleLineId: line.id, videoId: line.videoId, cardType, notes,
        stability: init.stability, stabilityFast: init.stabilityFast, difficulty: init.difficulty,
        due: init.due, state: init.state, reps: init.reps, lapses: init.lapses,
        elapsedDays: init.elapsedDays, scheduledDays: init.scheduledDays,
        learningStep: init.learningStep, fsrsModel: init.model,
      })
      .onConflictDoNothing()
      .returning();
    if (ins.length > 0) await bumpDailyStats(tx, userId, { cardsCreated: 1 });
    return ins;
  });

  if (inserted.length > 0) {
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
 * Remaining daily allowances for new-card introductions and due-card reviews,
 * honoring `newCardsPerDay` and `maxReviewsPerDay`. New cards are always
 * capped: an unset `newCardsPerDay` (or null `dailyGoals`) falls back to
 * DEFAULT_NEW_CARDS_PER_DAY (T3.5) so beginners aren't buried. Reviews stay
 * uncapped (null) unless `maxReviewsPerDay` is set. A card's first review writes a review_logs row whose
 * state is the state *before* the review: state=0 = a new introduction, state≠0
 * = a review of an already-introduced card. Counting today's distinct cards on
 * each side gives what's already been consumed.
 */
async function dailyAllowances(
  db: Database,
  userId: string,
): Promise<{ newRemaining: number; reviewRemaining: number | null }> {
  const [settings] = await db
    .select({ dailyGoals: userSettings.dailyGoals })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const newCap = effectiveNewCardsPerDay(settings?.dailyGoals);
  const reviewCap = settings?.dailyGoals?.maxReviewsPerDay ?? null;

  const [row] = await db
    .select({
      newIntro: sql<number>`count(distinct case when ${reviewLogs.state} = 0 then ${reviewLogs.cardId} end)`,
      reviews: sql<number>`count(distinct case when ${reviewLogs.state} <> 0 then ${reviewLogs.cardId} end)`,
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfToday())));

  return {
    newRemaining: Math.max(0, newCap - Number(row?.newIntro ?? 0)),
    reviewRemaining: reviewCap == null ? null : Math.max(0, reviewCap - Number(row?.reviews ?? 0)),
  };
}

const QUEUE_COLUMNS = {
  cardId: sentenceCards.id, videoId: sentenceCards.videoId, cardType: sentenceCards.cardType,
  notes: sentenceCards.notes, due: sentenceCards.due,
  stability: sentenceCards.stability, stabilityFast: sentenceCards.stabilityFast,
  difficulty: sentenceCards.difficulty, lastReview: sentenceCards.lastReview,
  state: sentenceCards.state, reps: sentenceCards.reps, lapses: sentenceCards.lapses,
  elapsedDays: sentenceCards.elapsedDays, scheduledDays: sentenceCards.scheduledDays,
  learningStep: sentenceCards.learningStep, fsrsModel: sentenceCards.fsrsModel,
  textOriginal: subtitleLines.textOriginal, textTranslation: subtitleLines.textTranslation,
  tStartMs: subtitleLines.tStartMs, tEndMs: subtitleLines.tEndMs,
  source: videos.source, sourceId: videos.sourceId,
  lineId: sentenceCards.subtitleLineId,
  tokens: subtitleLines.tokens,
} as const;

/**
 * The review badge's number: what a session started now would actually serve
 * today. Due reviews (already introduced) are capped by the remaining
 * `maxReviewsPerDay` allowance when set; due new cards by the remaining new
 * allowance (newCardsPerDay or the T3.5 default). Pure — unit-tested.
 */
export function servableDueCount(
  due: { reviews: number; newCards: number },
  allowances: { newRemaining: number; reviewRemaining: number | null },
): number {
  const reviews = allowances.reviewRemaining == null
    ? due.reviews
    : Math.min(due.reviews, allowances.reviewRemaining);
  return reviews + Math.min(due.newCards, allowances.newRemaining);
}

/**
 * Count for the sidebar/dashboard "review due" badge — the number of cards the
 * queue would serve today, honoring the daily caps (servableDueCount), so 50
 * freshly mined cards show 10, not 50. One count over
 * `sentence_cards_user_due_idx` (split by state with FILTER) plus the
 * allowances query; never builds the queue (joins + word_entries).
 */
export async function countDueCards(db: Database, userId: string): Promise<number> {
  const [[row], allowances] = await Promise.all([
    db
      .select({
        reviews: sql<number>`count(*) filter (where ${sentenceCards.state} <> 0)`,
        newCards: sql<number>`count(*) filter (where ${sentenceCards.state} = 0)`,
      })
      .from(sentenceCards)
      .where(and(eq(sentenceCards.userId, userId), lte(sentenceCards.due, new Date()))),
    dailyAllowances(db, userId),
  ]);
  return servableDueCount(
    { reviews: Number(row?.reviews ?? 0), newCards: Number(row?.newCards ?? 0) },
    allowances,
  );
}

/** Cards due now for the user, with the clip + sentence and preview intervals. */
export async function getReviewQueue(db: Database, userId: string, limit = 20) {
  const now = new Date();
  const { newRemaining, reviewRemaining } = await dailyAllowances(db, userId);
  // The user's scheduler (fitted FSRS-7 weights + desired retention, T3.1), and
  // pre-0018 cards get their FSRS-7 memory replayed before they're previewed.
  const fsrs = await loadUserFsrs(db, userId);
  await rebuildMemory(db, userId, fsrs);

  // Due review cards (already introduced): capped by maxReviewsPerDay (null =
  // unlimited), oldest-due first.
  const reviewCap = reviewRemaining == null ? limit : Math.min(reviewRemaining, limit);
  const reviewRows = reviewCap > 0
    ? await db
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
        .limit(reviewCap)
    : [];

  // Due new cards, capped by the remaining daily-new allowance (always set: the
  // user's newCardsPerDay or the default).
  const newCap = Math.min(newRemaining, limit);
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
  // The user's token corrections (T3.7) replace the shared tokens before the
  // word entries are collected, so a fixed word brings its corrected entry.
  const rows = await withTokenOverrides(db, userId, [...reviewRows, ...newRows].slice(0, limit), (r) => r.lineId);

  const allTokenRows: Token[] = rows
    .map((r) => (r.tokens as Token[]) ?? [])
    .flat();
  const uniqueIds = [...new Set(allTokenRows.map((t) => t.wordEntryId).filter(Boolean))];

  const entries =
    uniqueIds.length > 0
      ? await db
          .select({
            id: wordEntries.id, reading: wordEntries.reading, lemma: wordEntries.lemma,
            definitions: wordEntries.definitions, pos: wordEntries.pos, frequencyRank: wordEntries.frequencyRank,
          })
          .from(wordEntries)
          .where(inArray(wordEntries.id, uniqueIds as string[]))
      : [];

  return buildReviewQueuePayload(rows, entries, fsrs, now);
}

// frequencyRank lets the cloze review mode (T3.11) blank the line's rarest word.
export type WordEntryData = {
  reading: string; lemma: string; definitions: Definition[]; pos: string; frequencyRank: number | null;
};

/** The joined sentence_cards ⋈ subtitle_lines ⋈ videos row (QUEUE_COLUMNS). */
export type ReviewQueueRow = {
  cardId: string; videoId: string; cardType: string; notes: string | null; due: Date;
  stability: number; stabilityFast: number | null; difficulty: number; lastReview: Date | null; state: number;
  reps: number; lapses: number; elapsedDays: number; scheduledDays: number;
  learningStep: number; fsrsModel: string;
  textOriginal: string; textTranslation: string | null; tStartMs: number; tEndMs: number;
  source: string; sourceId: string; tokens: Token[] | null;
  /** The card's subtitle line (for the user's token corrections). */
  lineId?: string;
};

export type WordEntryRow = {
  id: string; reading: string | null; lemma: string; definitions: Definition[]; pos: string | null;
  frequencyRank?: number | null;
};

export type ReviewQueueCard = Omit<
  ReviewQueueRow,
  "stability" | "stabilityFast" | "difficulty" | "lastReview" | "reps" | "lapses" | "elapsedDays"
    | "scheduledDays" | "learningStep" | "fsrsModel" | "textOriginal" | "textTranslation" | "tStartMs" | "tEndMs" | "source" | "sourceId"
    | "lineId"
> & {
  clip: { source: string; sourceId: string; startMs: number; endMs: number };
  sentence: { text: string; translation: string | null };
  intervals: ReturnType<FsrsService["preview"]>;
  tokens: Token[];
};

export type ReviewQueuePayload = {
  cards: ReviewQueueCard[];
  wordEntries: Record<string, WordEntryData>;
};

/**
 * Shape the joined rows + fetched dictionary entries into the queue payload.
 * The word-entry map is returned ONCE at the top level instead of being copied
 * onto every card — with a 20-card queue of large JMdict definitions that was
 * ~95% duplicate bytes over the wire and in the RSC props. Pure and testable.
 */
export function buildReviewQueuePayload(
  rows: ReviewQueueRow[],
  entries: WordEntryRow[],
  fsrs: FsrsService,
  now: Date = new Date(),
): ReviewQueuePayload {
  const wordEntries: Record<string, WordEntryData> = {};
  for (const e of entries) {
    wordEntries[e.id] = {
      reading: e.reading ?? "", lemma: e.lemma, definitions: e.definitions, pos: e.pos ?? "",
      frequencyRank: e.frequencyRank ?? null,
    };
  }

  const cards = rows.map((r): ReviewQueueCard => ({
    cardId: r.cardId,
    videoId: r.videoId,
    cardType: r.cardType,
    notes: r.notes,
    due: r.due,
    state: r.state,
    clip: { source: r.source, sourceId: r.sourceId, startMs: r.tStartMs, endMs: r.tEndMs },
    sentence: { text: r.textOriginal, translation: r.textTranslation },
    intervals: fsrs.preview(r.cardId, cardStateOf(r), now),
    tokens: r.tokens ?? [],
  }));

  return { cards, wordEntries };
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

  // Fetch the card and the reviewed line's tokens in one round trip (join),
  // so the per-word stats don't need a second select after the update.
  const [row] = await db
    .select({ card: sentenceCards, tokens: subtitleLines.tokens })
    .from(sentenceCards)
    .leftJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .where(and(eq(sentenceCards.id, cardId), eq(sentenceCards.userId, userId)))
    .limit(1);
  if (!row) return { status: 404, body: { error: "card not found" } };
  let card = row.card;

  // The user's scheduler (T3.1). A pre-0018 card has its FSRS-7 memory rebuilt
  // from its review history first (or is kept on FSRS-5 if that's incomplete).
  const fsrs = await loadUserFsrs(db, userId);
  if (card.fsrsModel === "fsrs-7" && card.state !== 0 && card.stabilityFast == null) {
    await rebuildMemory(db, userId, fsrs, { cardIds: [cardId] });
    const [fresh] = await db.select().from(sentenceCards).where(eq(sentenceCards.id, cardId)).limit(1);
    if (!fresh) return { status: 404, body: { error: "card not found" } };
    card = fresh;
  }

  const now = new Date();
  const { card: next, log } = fsrs.review(cardId, cardStateOf(card), grade as ReviewGrade, now);
  // Stats go to the words as this user sees them (T3.7): corrected entries from
  // now on; past stats are not rewritten.
  const overrides = await loadTokenOverrides(db, userId, [card.subtitleLineId]);
  const wordIds = correctLine(row.tokens as Token[] | null, overrides.get(card.subtitleLineId)).tokens
    .map((t) => t.wordEntryId)
    .filter((id): id is string => !!id);

  // Reschedule, log, and feed the stats read-sides atomically: the review log is
  // the declared basis for re-optimizing FSRS params (D6), so a rescheduled card
  // must never be left without its log (or the stats bumps).
  await db.transaction(async (tx) => {
    await tx
      .update(sentenceCards)
      .set({
        stability: next.stability, stabilityFast: next.stabilityFast, difficulty: next.difficulty,
        due: next.due, lastReview: now, state: next.state, reps: next.reps, lapses: next.lapses,
        elapsedDays: next.elapsedDays, scheduledDays: next.scheduledDays,
        learningStep: next.learningStep, fsrsModel: next.model,
      })
      .where(eq(sentenceCards.id, cardId));

    await tx.insert(reviewLogs).values({
      cardId, userId, grade: log.grade, state: log.state, due: log.due, lastReview: log.lastReview,
      stability: log.stability, stabilityFast: log.stabilityFast, difficulty: log.difficulty,
      elapsedDays: log.elapsedDays, lastElapsedDays: log.lastElapsedDays, scheduledDays: log.scheduledDays,
      learningStep: log.learningStep, fsrsModel: log.model, reviewedAt: log.reviewedAt,
    });

    await bumpDailyStats(tx, userId, { reviewsDone: 1 });
    await bumpWordReviews(tx, userId, wordIds, grade >= 3);
  });

  return { status: 200, body: { cardId, due: next.due, state: next.state, reps: next.reps } };
}

/**
 * Update a card's notes (PATCH /api/cards/:id). Scoped to the owner: a card
 * that isn't theirs is a 404, same as one that doesn't exist.
 */
export async function updateCardNotes(
  db: Database,
  userId: string,
  cardId: string,
  body: { notes?: unknown },
): Promise<Result> {
  if (typeof body?.notes !== "string") return { status: 400, body: { error: "notes must be a string" } };
  const notesError = validateNotes(body.notes);
  if (notesError) return { status: 400, body: { error: notesError } };

  const updated = await db
    .update(sentenceCards)
    .set({ notes: body.notes })
    .where(and(eq(sentenceCards.id, cardId), eq(sentenceCards.userId, userId)))
    .returning({ id: sentenceCards.id, notes: sentenceCards.notes });
  if (updated.length === 0) return { status: 404, body: { error: "card not found" } };
  return { status: 200, body: updated[0] };
}

/**
 * Delete a card (DELETE /api/cards/:id, the Player's "Undo" after mining).
 * Scoped to the owner (someone else's card is a 404); its review_logs go with
 * it via the FK cascade.
 */
export async function deleteCard(db: Database, userId: string, cardId: string): Promise<Result> {
  const deleted = await db
    .delete(sentenceCards)
    .where(and(eq(sentenceCards.id, cardId), eq(sentenceCards.userId, userId)))
    .returning({ id: sentenceCards.id });
  if (deleted.length === 0) return { status: 404, body: { error: "card not found" } };
  return { status: 200, body: { id: deleted[0].id, deleted: true } };
}
