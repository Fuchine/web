// FSRS scheduling service (D6). Wraps ts-fsrs so the rest of the app never
// touches the library directly. The CardState shape mirrors the FSRS columns
// on `sentence_cards`; ReviewLogState mirrors `review_logs`.

import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
  type RecordLogItem,
} from "ts-fsrs";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

/** Review grade as stored in the DB and shown in the UI. */
export const GRADE = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type ReviewGrade = (typeof GRADE)[keyof typeof GRADE];

/** Persisted FSRS state — maps 1:1 to `sentence_cards` columns. */
export type CardState = {
  stability: number;
  difficulty: number;
  due: Date;
  lastReview: Date | null;
  state: number; // 0 New 1 Learning 2 Review 3 Relearning
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
};

/** A review event — maps 1:1 to `review_logs` columns. */
export type ReviewLogState = {
  grade: ReviewGrade;
  state: number;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  reviewedAt: Date;
};

function toFsrsCard(s: CardState): FsrsCard {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview ?? undefined,
  } as FsrsCard;
}

function fromFsrsCard(c: FsrsCard): CardState {
  return {
    stability: c.stability,
    difficulty: c.difficulty,
    due: c.due,
    lastReview: c.last_review ?? null,
    state: c.state,
    reps: c.reps,
    lapses: c.lapses,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
  };
}

/** Initial state for a freshly mined card. */
export function newCardState(now: Date = new Date()): CardState {
  return fromFsrsCard(createEmptyCard(now));
}

/** Apply a grade, returning the next card state and the log to persist. */
export function reviewCard(
  current: CardState,
  grade: ReviewGrade,
  now: Date = new Date(),
): { card: CardState; log: ReviewLogState } {
  const item: RecordLogItem = scheduler.next(
    toFsrsCard(current),
    now,
    grade as FsrsGrade,
  );
  return {
    card: fromFsrsCard(item.card),
    log: {
      grade,
      state: item.log.state,
      due: item.log.due,
      stability: item.log.stability,
      difficulty: item.log.difficulty,
      elapsedDays: item.log.elapsed_days,
      lastElapsedDays: item.log.last_elapsed_days,
      scheduledDays: item.log.scheduled_days,
      reviewedAt: item.log.review,
    },
  };
}

/** Preview the next due date for each grade — powers "Again <1m / Good 4d". */
export function previewIntervals(
  current: CardState,
  now: Date = new Date(),
): Record<ReviewGrade, Date> {
  const log = scheduler.repeat(toFsrsCard(current), now);
  return {
    [GRADE.Again]: log[Rating.Again].card.due,
    [GRADE.Hard]: log[Rating.Hard].card.due,
    [GRADE.Good]: log[Rating.Good].card.due,
    [GRADE.Easy]: log[Rating.Easy].card.due,
  };
}
