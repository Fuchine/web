// FSRS scheduling service (D6, T3.1). Wraps ts-fsrs v6 so the rest of the app
// never touches the library directly. CardState mirrors the FSRS columns on
// `sentence_cards`; ReviewLogState mirrors `review_logs`.
//
// Models. New cards are scheduled with FSRS-7 (ts-fsrs v6's default: 34
// weights, a second "fast" stability trace, fractional-day intervals). Cards
// learned before the upgrade were scheduled by ts-fsrs v4 (FSRS-5) and carry no
// `stabilityFast`. Upstream's migration rule is followed literally:
//   - a learned card whose review history is complete is moved to FSRS-7 by
//     REPLAYING that history (Reschedule.replay) — never by inventing a
//     stabilityFast; due date, counters and logs are preserved;
//   - a learned card without complete history stays on FSRS-5, the model that
//     scheduled it, with FSRS-5 default weights.
// `model` on the card records which one applies ("fsrs-7" | "fsrs-5"). A
// FSRS-7 card with state ≠ New and stabilityFast = null still needs its replay
// (see needsReplay / replayMemory); the web layer does that before scheduling.
//
// Per-user parameters (T3.1): `createFsrs({ params, desiredRetention })` builds
// a scheduler with the user's fitted FSRS-7 weights (null = defaults) and
// desired retention (null = 0.9). FSRS-5 cards use the user's retention with
// FSRS-5 default weights (the optimizer only fits FSRS-7).

import { DefaultScheduler, Rating, type Grade as FsrsGrade } from "ts-fsrs";
import { Reschedule } from "ts-fsrs/reschedule";
import { FSRS7_DEFAULT_WEIGHTS, checkFSRS7Parameters } from "ts-fsrs/models/fsrs-7";

/** Review grade as stored in the DB and shown in the UI. */
export const GRADE = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type ReviewGrade = (typeof GRADE)[keyof typeof GRADE];

/** Which FSRS model schedules a card (`sentence_cards.fsrs_model`). */
export type FsrsModel = "fsrs-7" | "fsrs-5";
export const FSRS_MODELS: readonly FsrsModel[] = ["fsrs-7", "fsrs-5"];

/** FSRS-7 weight vector length (`user_settings.fsrs_params`). */
export const FSRS7_PARAM_COUNT = 34;
/** The FSRS-7 preset weights ts-fsrs ships (what `fsrs_params = null` means). */
export const DEFAULT_FSRS7_PARAMS: readonly number[] = FSRS7_DEFAULT_WEIGHTS;

/** Desired retention: default, accepted range, and the recommended band. */
export const DEFAULT_DESIRED_RETENTION = 0.9;
export const DESIRED_RETENTION_MIN = 0.8;
export const DESIRED_RETENTION_MAX = 0.95;
export const RECOMMENDED_RETENTION_BAND = [0.85, 0.9] as const;

const DAY_MS = 86_400_000;

/** Persisted FSRS state — maps 1:1 to `sentence_cards` columns. */
export type CardState = {
  stability: number;
  /** FSRS-7 fast trace. null = FSRS-5 card, or FSRS-7 card awaiting replay. */
  stabilityFast: number | null;
  difficulty: number;
  due: Date;
  lastReview: Date | null;
  state: number; // 0 New 1 Learning 2 Review 3 Relearning
  reps: number;
  lapses: number;
  /** Fractional days between the last two reviews (Fuchine-computed; not a ts-fsrs v6 field). */
  elapsedDays: number;
  /** Fractional days the card was scheduled for (FSRS-7 intervals are fractional). */
  scheduledDays: number;
  /** Index into the (re)learning steps. */
  learningStep: number;
  model: FsrsModel;
};

/** A review event — maps 1:1 to `review_logs` columns. Memory fields are pre-review. */
export type ReviewLogState = {
  grade: ReviewGrade;
  state: number;
  due: Date;
  lastReview: Date | null;
  stability: number;
  stabilityFast: number | null;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningStep: number;
  model: FsrsModel;
  reviewedAt: Date;
};

/** One past review, as replayed to rebuild memory (from `review_logs`). */
export type ReviewHistoryItem = { grade: number; reviewedAt: Date };

/** FSRS-7 memory state. */
export type MemoryState = { stability: number; stabilityFast: number; difficulty: number };

/** User-level scheduler configuration (`user_settings`). null = default. */
export type FsrsUserConfig = {
  params?: readonly number[] | null;
  desiredRetention?: number | null;
};

export class FsrsStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FsrsStateError";
  }
}

/** Initial state for a freshly mined card (equals FSRS-7 `newCard`). */
export function newCardState(now: Date = new Date()): CardState {
  return {
    stability: 0, stabilityFast: 0, difficulty: 0, due: now, lastReview: null,
    state: 0, reps: 0, lapses: 0, elapsedDays: 0, scheduledDays: 0, learningStep: 0,
    model: "fsrs-7",
  };
}

/** True when an FSRS-7 card must have its memory rebuilt from history first. */
export function needsReplay(s: Pick<CardState, "model" | "state" | "stabilityFast">): boolean {
  return s.model === "fsrs-7" && s.state !== 0 && s.stabilityFast == null;
}

/* ------------------------------------------------------------------ */
/* Validation (server-side; the optimizer output is untrusted input)   */
/* ------------------------------------------------------------------ */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate an FSRS-7 weight vector: exactly 34 finite numbers inside the
 * model's parameter bounds (ts-fsrs `checkFSRS7Parameters`). Values are not
 * clipped: an out-of-bounds vector is rejected, not silently changed.
 */
export function validateFsrsParams(raw: unknown): ValidationResult<number[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "params must be an array of numbers" };
  if (raw.length !== FSRS7_PARAM_COUNT) {
    return { ok: false, error: `params must have exactly ${FSRS7_PARAM_COUNT} values (FSRS-7)` };
  }
  if (!raw.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return { ok: false, error: "params must be finite numbers" };
  }
  try {
    checkFSRS7Parameters(raw as number[]);
  } catch {
    return { ok: false, error: "params are outside the FSRS-7 parameter bounds" };
  }
  return { ok: true, value: (raw as number[]).slice() };
}

/** Validate a desired retention in [DESIRED_RETENTION_MIN, DESIRED_RETENTION_MAX]. */
export function validateDesiredRetention(raw: unknown): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: "desiredRetention must be a number" };
  }
  if (raw < DESIRED_RETENTION_MIN || raw > DESIRED_RETENTION_MAX) {
    return {
      ok: false,
      error: `desiredRetention must be between ${DESIRED_RETENTION_MIN} and ${DESIRED_RETENTION_MAX}`,
    };
  }
  return { ok: true, value: Math.round(raw * 1000) / 1000 };
}

/* ------------------------------------------------------------------ */
/* Scheduler                                                           */
/* ------------------------------------------------------------------ */

type Fsrs7Scheduler = Awaited<ReturnType<typeof DefaultScheduler<"FSRS-7">>>;
type Fsrs5Scheduler = Awaited<ReturnType<typeof DefaultScheduler<"FSRS-5">>>;
type AnyCardOut = {
  stability: number; difficulty: number; dueAt: Date; lastReviewAt: Date | null; state: number;
  reps: number; lapses: number; scheduledDays: number; learningStep: number; stabilityFast?: number;
};
type AnyRevlogOut = Omit<AnyCardOut, "reps" | "lapses"> & { reviewTime: Date; rating: number };

/** The scheduling operations the app needs, bound to one user's configuration. */
export interface FsrsService {
  /** Effective FSRS-7 weights (the user's, or the defaults). */
  readonly params: readonly number[];
  readonly desiredRetention: number;
  readonly customParams: boolean;
  /** Apply a grade, returning the next card state and the log to persist. */
  review(cardId: string, current: CardState, grade: ReviewGrade, now?: Date): { card: CardState; log: ReviewLogState };
  /** Next due date per grade — powers "Again <1m / Good 4d". */
  preview(cardId: string, current: CardState, now?: Date): Record<ReviewGrade, Date>;
  /** Rebuild FSRS-7 memory from a card's full review history (Reschedule.replay). */
  replayMemory(history: readonly ReviewHistoryItem[]): MemoryState;
  /** Base interval in days the model gives a learned card at `retention` (workload estimate). */
  intervalDays(current: CardState, retention: number): number | null;
}

const SCHEDULER_OPTIONS = { enableFuzz: true } as const;

function scheduleStatusOf(state: number): "new" | "learning" | "review" {
  return state === 0 ? "new" : state === 2 ? "review" : "learning";
}

function toInput(cardId: string, s: CardState) {
  return {
    cardId,
    stability: s.stability,
    difficulty: s.difficulty,
    dueAt: s.due,
    lastReviewAt: s.lastReview,
    state: s.state as 0 | 1 | 2 | 3,
    scheduleStatus: scheduleStatusOf(s.state),
    reps: s.reps,
    lapses: s.lapses,
    scheduledDays: s.scheduledDays,
    learningStep: s.learningStep,
  };
}

function elapsedSince(last: Date | null, now: Date): number {
  return last ? Math.max(0, (now.getTime() - last.getTime()) / DAY_MS) : 0;
}

class Service implements FsrsService {
  readonly customParams: boolean;
  constructor(
    private readonly s7: Fsrs7Scheduler,
    private readonly s5: Fsrs5Scheduler,
    readonly params: readonly number[],
    readonly desiredRetention: number,
    customParams: boolean,
  ) {
    this.customParams = customParams;
  }

  private cardInput(cardId: string, s: CardState) {
    if (!FSRS_MODELS.includes(s.model)) throw new FsrsStateError(`unknown FSRS model: ${String(s.model)}`);
    if (s.model === "fsrs-5") return { model: "fsrs-5" as const, input: toInput(cardId, s) };
    if (needsReplay(s)) throw new FsrsStateError("card memory must be replayed for FSRS-7 before scheduling");
    return { model: "fsrs-7" as const, input: { ...toInput(cardId, s), stabilityFast: s.stabilityFast ?? 0 } };
  }

  review(cardId: string, current: CardState, grade: ReviewGrade, now: Date = new Date()) {
    const c = this.cardInput(cardId, current);
    const g = grade as FsrsGrade;
    const r = c.model === "fsrs-7"
      ? this.s7.review({ card: c.input, grade: g, now })
      : this.s5.review({ card: c.input, grade: g, now });
    const out = r.card as AnyCardOut;
    const rev = r.revlog as AnyRevlogOut;
    const elapsed = elapsedSince(current.lastReview, now);
    const card: CardState = {
      stability: out.stability,
      stabilityFast: c.model === "fsrs-7" ? (out.stabilityFast ?? null) : null,
      difficulty: out.difficulty,
      due: out.dueAt,
      lastReview: out.lastReviewAt ?? now,
      state: out.state,
      reps: out.reps,
      lapses: out.lapses,
      elapsedDays: elapsed,
      scheduledDays: out.scheduledDays,
      learningStep: out.learningStep,
      model: c.model,
    };
    const log: ReviewLogState = {
      grade,
      state: rev.state,
      due: rev.dueAt,
      lastReview: rev.lastReviewAt ?? null,
      stability: rev.stability,
      stabilityFast: c.model === "fsrs-7" ? (rev.stabilityFast ?? null) : null,
      difficulty: rev.difficulty,
      elapsedDays: elapsed,
      lastElapsedDays: current.elapsedDays,
      scheduledDays: rev.scheduledDays,
      learningStep: rev.learningStep,
      model: c.model,
      reviewedAt: rev.reviewTime ?? now,
    };
    return { card, log };
  }

  preview(cardId: string, current: CardState, now: Date = new Date()) {
    const c = this.cardInput(cardId, current);
    const items = c.model === "fsrs-7"
      ? [...this.s7.preview({ card: c.input, now })]
      : [...this.s5.preview({ card: c.input, now })];
    const due = (g: number) => {
      const item = items.find((i) => i.grade === g);
      if (!item) throw new FsrsStateError(`preview missing grade ${g}`);
      return (item.card as AnyCardOut).dueAt;
    };
    return {
      [GRADE.Again]: due(Rating.Again),
      [GRADE.Hard]: due(Rating.Hard),
      [GRADE.Good]: due(Rating.Good),
      [GRADE.Easy]: due(Rating.Easy),
    } as Record<ReviewGrade, Date>;
  }

  replayMemory(history: readonly ReviewHistoryItem[]): MemoryState {
    const reviews = history
      .filter((h) => h.grade >= 1 && h.grade <= 4)
      .map((h) => ({ rating: h.grade as FsrsGrade, reviewTime: h.reviewedAt }));
    if (reviews.length === 0) throw new FsrsStateError("cannot replay an empty review history");
    const { memoryState } = new Reschedule(this.s7).replay({ history: reviews });
    return {
      stability: memoryState.stability,
      stabilityFast: memoryState.stabilityFast,
      difficulty: memoryState.difficulty,
    };
  }

  intervalDays(current: CardState, retention: number): number | null {
    if (current.state === 0 || current.stability <= 0) return null;
    if (current.model === "fsrs-5") {
      return this.s5.model.nextInterval({ stability: current.stability, difficulty: current.difficulty }, retention);
    }
    if (current.stabilityFast == null) return null;
    return this.s7.model.nextInterval(
      { stability: current.stability, stabilityFast: current.stabilityFast, difficulty: current.difficulty },
      retention,
    );
  }
}

// Schedulers are cheap to build (~0.2 ms after the first) but async; keep a
// small cache keyed by the effective configuration.
const CACHE_MAX = 64;
const cache = new Map<string, Promise<FsrsService>>();

/**
 * Build (or reuse) the scheduling service for a user configuration. Invalid
 * stored values fall back to the defaults rather than breaking reviews: the
 * write path (validateFsrsParams / validateDesiredRetention) is the gate.
 */
export function createFsrs(config: FsrsUserConfig = {}): Promise<FsrsService> {
  const parsedParams = config.params == null ? null : validateFsrsParams(config.params);
  const params = parsedParams?.ok ? parsedParams.value : null;
  const parsedRet = config.desiredRetention == null ? null : validateDesiredRetention(config.desiredRetention);
  const desiredRetention = parsedRet?.ok ? parsedRet.value : DEFAULT_DESIRED_RETENTION;

  const key = JSON.stringify([params, desiredRetention]);
  const hit = cache.get(key);
  if (hit) return hit;

  const built = (async () => {
    const s7 = await DefaultScheduler({
      ...SCHEDULER_OPTIONS, desiredRetention, ...(params ? { weights: params } : {}),
    });
    const s5 = await DefaultScheduler({ ...SCHEDULER_OPTIONS, version: "FSRS-5", desiredRetention });
    return new Service(s7, s5, params ?? DEFAULT_FSRS7_PARAMS, desiredRetention, params != null) as FsrsService;
  })();
  built.catch(() => cache.delete(key));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, built);
  return built;
}

/**
 * Steady-state review-load approximation (NOT a simulation): each learned card
 * is reviewed once per the interval the model gives it at `retention`, plus an
 * expected same-day relearn for the (1 − retention) share that lapses. New
 * cards, learning steps and backlog are ignored. Reviews per day.
 */
export function estimateDailyReviews(
  fsrs: FsrsService,
  cards: readonly CardState[],
  retention: number,
): number {
  let total = 0;
  for (const c of cards) {
    const ivl = fsrs.intervalDays(c, retention);
    if (ivl == null || !Number.isFinite(ivl)) continue;
    total += (1 + (1 - retention)) / Math.max(1, ivl);
  }
  return total;
}
