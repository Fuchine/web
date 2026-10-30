// Per-user FSRS (T3.1): load the user's scheduler (fitted FSRS-7 weights +
// desired retention), rebuild FSRS-7 memory for pre-0018 cards, export the
// review history in the optimizer's input format, and read/write the FSRS
// settings. Auth-agnostic and testable; pure helpers are unit-tested.

import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  type Database, type DbOrTx, reviewLogs, sentenceCards, userSettings,
} from "@fuchine/db";
import {
  type CardState, type FsrsModel, type FsrsService,
  DEFAULT_DESIRED_RETENTION, DESIRED_RETENTION_MAX, DESIRED_RETENTION_MIN, FSRS7_PARAM_COUNT,
  RECOMMENDED_RETENTION_BAND, createFsrs, estimateDailyReviews, validateDesiredRetention,
  validateFsrsParams,
} from "@fuchine/core";

export type Result = { status: number; body: Record<string, unknown> };

/**
 * Reviews needed before "Optimize my schedule" is enabled. The optimizer
 * (@open-spaced-repetition/binding) documents no minimum — fsrs-rs trains on a
 * handful of items — so this is the task's fallback of 400 reviews, the
 * figure Anki's FSRS guidance has used for "enough history to beat defaults".
 */
export const MIN_REVIEWS_FOR_OPTIMIZE = 400;

/** Retentions the workload preview is computed for (the slider's stops). */
export const WORKLOAD_RETENTIONS: number[] = Array.from(
  { length: Math.round((DESIRED_RETENTION_MAX - DESIRED_RETENTION_MIN) * 100) + 1 },
  (_, i) => Math.round((DESIRED_RETENTION_MIN + i / 100) * 100) / 100,
);

/** The FSRS columns of a sentence_cards row. */
export type CardFsrsRow = {
  stability: number; stabilityFast: number | null; difficulty: number; due: Date;
  lastReview: Date | null; state: number; reps: number; lapses: number; elapsedDays: number;
  scheduledDays: number; learningStep: number; fsrsModel: string;
};

/** Reconstruct the FSRS CardState from a sentence_cards row. */
export function cardStateOf(c: CardFsrsRow): CardState {
  return {
    stability: c.stability, stabilityFast: c.stabilityFast, difficulty: c.difficulty, due: c.due,
    lastReview: c.lastReview, state: c.state, reps: c.reps, lapses: c.lapses,
    elapsedDays: c.elapsedDays, scheduledDays: c.scheduledDays, learningStep: c.learningStep,
    model: (c.fsrsModel === "fsrs-5" ? "fsrs-5" : "fsrs-7") as FsrsModel,
  };
}

/** The user's scheduler: stored params/retention, or the defaults. */
export async function loadUserFsrs(db: DbOrTx, userId: string): Promise<FsrsService> {
  const [row] = await db
    .select({ fsrsParams: userSettings.fsrsParams, desiredRetention: userSettings.desiredRetention })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return createFsrs({ params: row?.fsrsParams ?? null, desiredRetention: row?.desiredRetention ?? null });
}

/**
 * Rebuild FSRS-7 memory (stability, stabilityFast, difficulty) from review_logs
 * by replaying each card's history; due dates, counters and logs are kept.
 *
 *  - scope "pending" (default): only FSRS-7 learned cards still missing their
 *    fast trace — the pre-0018 cards. Called before scheduling; a no-op query
 *    once a user's cards are upgraded.
 *  - scope "all": every FSRS-7 learned card — after the user's weights change,
 *    so memory matches the new parameters (as Anki recomputes memory states).
 *
 * A card whose history is incomplete (log count ≠ reps) can't be replayed
 * honestly; it is moved to FSRS-5, the model that scheduled it (same rule as
 * migration 0018). Returns how many cards were replayed / moved.
 */
export async function rebuildMemory(
  db: DbOrTx,
  userId: string,
  fsrs: FsrsService,
  opts: { scope?: "pending" | "all"; cardIds?: string[] } = {},
): Promise<{ replayed: number; movedToFsrs5: number }> {
  const conds = [
    eq(sentenceCards.userId, userId),
    eq(sentenceCards.fsrsModel, "fsrs-7"),
    ne(sentenceCards.state, 0),
  ];
  if ((opts.scope ?? "pending") === "pending") conds.push(isNull(sentenceCards.stabilityFast));
  if (opts.cardIds) {
    if (opts.cardIds.length === 0) return { replayed: 0, movedToFsrs5: 0 };
    conds.push(inArray(sentenceCards.id, opts.cardIds));
  }
  const cards = await db
    .select({ id: sentenceCards.id, reps: sentenceCards.reps })
    .from(sentenceCards)
    .where(and(...conds));
  if (cards.length === 0) return { replayed: 0, movedToFsrs5: 0 };

  const logs = await db
    .select({ cardId: reviewLogs.cardId, grade: reviewLogs.grade, reviewedAt: reviewLogs.reviewedAt })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), inArray(reviewLogs.cardId, cards.map((c) => c.id))))
    .orderBy(asc(reviewLogs.cardId), asc(reviewLogs.reviewedAt));
  const byCard = new Map<string, { grade: number; reviewedAt: Date }[]>();
  for (const l of logs) {
    const list = byCard.get(l.cardId) ?? [];
    list.push({ grade: l.grade, reviewedAt: l.reviewedAt });
    byCard.set(l.cardId, list);
  }

  let replayed = 0;
  let movedToFsrs5 = 0;
  for (const c of cards) {
    const history = byCard.get(c.id) ?? [];
    if (history.length === 0 || history.length !== c.reps) {
      await db.update(sentenceCards).set({ fsrsModel: "fsrs-5", stabilityFast: null })
        .where(eq(sentenceCards.id, c.id));
      movedToFsrs5++;
      continue;
    }
    const mem = fsrs.replayMemory(history);
    await db.update(sentenceCards)
      .set({ stability: mem.stability, stabilityFast: mem.stabilityFast, difficulty: mem.difficulty })
      .where(eq(sentenceCards.id, c.id));
    replayed++;
  }
  return { replayed, movedToFsrs5 };
}

/* ------------------------------------------------------------------ */
/* Optimizer input: review_logs → revlog CSV                           */
/* ------------------------------------------------------------------ */

/** Header of the optimizer's revlog CSV (`convertCsvToFsrsItems`). */
export const REVLOG_CSV_HEADER = "card_id,review_time,review_rating,review_state,review_duration";

export type RevlogRow = { cardId: string; reviewedAt: Date; grade: number; state: number };

/**
 * One line per review, in the optimizer's input format: card_id, review_time
 * (epoch ms), review_rating (1–4), review_state (FSRS state before the review,
 * 0–3) and review_duration (ms; not tracked → 0). Pure.
 */
export function toRevlogCsv(rows: readonly RevlogRow[]): string {
  const lines = [REVLOG_CSV_HEADER];
  for (const r of rows) {
    if (r.grade < 1 || r.grade > 4) continue;
    lines.push(`${r.cardId},${r.reviewedAt.getTime()},${r.grade},${r.state},0`);
  }
  return `${lines.join("\n")}\n`;
}

/** The user's own review history as revlog CSV, card by card, oldest first. */
export async function exportReviewLogsCsv(db: Database, userId: string): Promise<string> {
  const rows = await db
    .select({
      cardId: reviewLogs.cardId, reviewedAt: reviewLogs.reviewedAt,
      grade: reviewLogs.grade, state: reviewLogs.state,
    })
    .from(reviewLogs)
    .where(eq(reviewLogs.userId, userId))
    .orderBy(asc(reviewLogs.cardId), asc(reviewLogs.reviewedAt));
  return toRevlogCsv(rows);
}

/* ------------------------------------------------------------------ */
/* Settings read/write                                                 */
/* ------------------------------------------------------------------ */

export type FsrsSettingsView = {
  model: "FSRS-7";
  params: number[] | null; // null = defaults
  paramCount: number;
  desiredRetention: number;
  defaultRetention: number;
  retentionRange: [number, number];
  recommendedBand: [number, number];
  reviewCount: number;
  minReviewsToOptimize: number;
  workload: {
    method: "approximation";
    note: string;
    cards: number;
    points: { retention: number; reviewsPerDay: number }[];
  };
};

const WORKLOAD_NOTE =
  "Approximation, not a simulation: each of your learned cards is reviewed once per the interval " +
  "FSRS gives it at that retention, plus a same-day relearn for expected lapses. New cards and " +
  "today's backlog are not included.";

/** Current FSRS settings + review count + workload preview for the settings UI. */
export async function getFsrsSettings(db: Database, userId: string): Promise<FsrsSettingsView> {
  const fsrs = await loadUserFsrs(db, userId);
  await rebuildMemory(db, userId, fsrs); // pre-0018 cards need memory for the preview

  const [{ n }] = await db.select({ n: count() }).from(reviewLogs).where(eq(reviewLogs.userId, userId));
  const rows = await db
    .select({
      stability: sentenceCards.stability, stabilityFast: sentenceCards.stabilityFast,
      difficulty: sentenceCards.difficulty, due: sentenceCards.due, lastReview: sentenceCards.lastReview,
      state: sentenceCards.state, reps: sentenceCards.reps, lapses: sentenceCards.lapses,
      elapsedDays: sentenceCards.elapsedDays, scheduledDays: sentenceCards.scheduledDays,
      learningStep: sentenceCards.learningStep, fsrsModel: sentenceCards.fsrsModel,
    })
    .from(sentenceCards)
    .where(and(eq(sentenceCards.userId, userId), ne(sentenceCards.state, 0)));
  const cards = rows.map(cardStateOf);

  return {
    model: "FSRS-7",
    params: fsrs.customParams ? [...fsrs.params] : null,
    paramCount: FSRS7_PARAM_COUNT,
    desiredRetention: fsrs.desiredRetention,
    defaultRetention: DEFAULT_DESIRED_RETENTION,
    retentionRange: [DESIRED_RETENTION_MIN, DESIRED_RETENTION_MAX],
    recommendedBand: [...RECOMMENDED_RETENTION_BAND],
    reviewCount: Number(n ?? 0),
    minReviewsToOptimize: MIN_REVIEWS_FOR_OPTIMIZE,
    workload: {
      method: "approximation",
      note: WORKLOAD_NOTE,
      cards: cards.length,
      points: WORKLOAD_RETENTIONS.map((r) => ({
        retention: r,
        reviewsPerDay: Math.round(estimateDailyReviews(fsrs, cards, r) * 10) / 10,
      })),
    },
  };
}

export type FsrsSettingsPatch = { params?: number[] | null; desiredRetention?: number | null };

/** Validate a PUT /api/settings/fsrs body. Pure. */
export function parseFsrsSettingsInput(
  body: unknown,
): { ok: true; value: FsrsSettingsPatch } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const value: FsrsSettingsPatch = {};
  if (b.params !== undefined) {
    if (b.params === null) value.params = null;
    else {
      const p = validateFsrsParams(b.params);
      if (!p.ok) return { ok: false, error: p.error };
      value.params = p.value;
    }
  }
  if (b.desiredRetention !== undefined) {
    if (b.desiredRetention === null) value.desiredRetention = null;
    else {
      const r = validateDesiredRetention(b.desiredRetention);
      if (!r.ok) return { ok: false, error: r.error };
      value.desiredRetention = r.value;
    }
  }
  if (value.params === undefined && value.desiredRetention === undefined) {
    return { ok: false, error: "nothing to update: send params and/or desiredRetention" };
  }
  return { ok: true, value };
}

/**
 * Store the user's fitted params and/or desired retention (null resets to the
 * default). When the weights change, FSRS-7 memory of every learned card is
 * rebuilt from its history under the new weights, in the same transaction;
 * due dates are not moved (the next review schedules with the new model).
 */
export async function updateFsrsSettings(db: Database, userId: string, body: unknown): Promise<Result> {
  const parsed = parseFsrsSettingsInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const v = parsed.value;

  const set: Partial<typeof userSettings.$inferInsert> = {};
  if (v.params !== undefined) set.fsrsParams = v.params;
  if (v.desiredRetention !== undefined) set.desiredRetention = v.desiredRetention;

  const rebuilt = await db.transaction(async (tx) => {
    await tx.insert(userSettings).values({ userId, ...set })
      .onConflictDoUpdate({ target: userSettings.userId, set });
    if (v.params === undefined) return null;
    const fsrs = await loadUserFsrs(tx, userId);
    return rebuildMemory(tx, userId, fsrs, { scope: "all" });
  });

  const view = await getFsrsSettings(db, userId);
  return { status: 200, body: { ...view, rebuilt } };
}
