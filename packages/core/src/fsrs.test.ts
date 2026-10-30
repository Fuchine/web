import { describe, expect, it } from "vitest";
import { DefaultScheduler } from "ts-fsrs";
import {
  type CardState,
  DEFAULT_FSRS7_PARAMS,
  FSRS7_PARAM_COUNT,
  FsrsStateError,
  GRADE,
  createFsrs,
  estimateDailyReviews,
  needsReplay,
  newCardState,
  validateDesiredRetention,
  validateFsrsParams,
} from "./fsrs";

const T0 = new Date("2026-01-01T12:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

/** Review a fresh card through `grades`, each on its due date. */
async function walk(cardId: string, grades: number[], config = {}) {
  const fsrs = await createFsrs(config);
  let card = newCardState(T0);
  let now = T0;
  const history: { grade: number; reviewedAt: Date }[] = [];
  for (const g of grades) {
    const r = fsrs.review(cardId, card, g as 1 | 2 | 3 | 4, now);
    history.push({ grade: g, reviewedAt: now });
    card = r.card;
    now = card.due;
  }
  return { fsrs, card, history, now };
}

describe("FSRS-7 mapping", () => {
  it("newCardState matches the FSRS-7 scheduler's new card", async () => {
    const s = await DefaultScheduler();
    const lib = s.newCard({ now: T0, cardId: "x" });
    const ours = newCardState(T0);
    expect(ours).toMatchObject({
      stability: lib.stability, stabilityFast: lib.stabilityFast, difficulty: lib.difficulty,
      due: lib.dueAt, lastReview: lib.lastReviewAt, state: lib.state, reps: lib.reps,
      lapses: lib.lapses, scheduledDays: lib.scheduledDays, learningStep: lib.learningStep,
      model: "fsrs-7",
    });
  });

  it("a review maps every column and logs the pre-review state", async () => {
    const fsrs = await createFsrs();
    const { card, log } = fsrs.review("card-a", newCardState(T0), GRADE.Good, T0);
    expect(card.model).toBe("fsrs-7");
    expect(card.reps).toBe(1);
    expect(card.state).not.toBe(0);
    expect(card.stability).toBeGreaterThan(0);
    expect(card.stabilityFast).toBeGreaterThan(0);
    expect(card.lastReview).toEqual(T0);
    expect(card.due.getTime()).toBeGreaterThan(T0.getTime());
    expect(log).toMatchObject({ grade: 3, state: 0, stability: 0, stabilityFast: 0, model: "fsrs-7", reviewedAt: T0 });
  });

  it("intervals are fractional days (FSRS-7) and fuzz is deterministic per card", async () => {
    const a = await walk("card-b", [3, 3, 3]);
    const b = await walk("card-b", [3, 3, 3]);
    expect(a.card.due).toEqual(b.card.due);
    expect(a.card.scheduledDays).toBeGreaterThan(1);
  });

  it("preview returns a due date for all four grades, Again earliest", async () => {
    const { fsrs, card, now } = await walk("card-c", [3, 3]);
    const p = fsrs.preview("card-c", card, now);
    expect(p[GRADE.Again].getTime()).toBeLessThan(p[GRADE.Good].getTime());
    expect(p[GRADE.Good].getTime()).toBeLessThanOrEqual(p[GRADE.Easy].getTime());
  });
});

describe("per-user parameters and retention", () => {
  const custom = [...DEFAULT_FSRS7_PARAMS];
  custom[2] = DEFAULT_FSRS7_PARAMS[2]! * 3; // initial stability after "Good"

  it("custom params change the schedule", async () => {
    expect(validateFsrsParams(custom).ok).toBe(true);
    const def = await createFsrs();
    const mine = await createFsrs({ params: custom });
    expect(mine.customParams).toBe(true);
    expect(def.customParams).toBe(false);
    const a = def.review("card-d", newCardState(T0), GRADE.Good, T0).card.due;
    const b = mine.review("card-d", newCardState(T0), GRADE.Good, T0).card.due;
    expect(b.getTime()).toBeGreaterThan(a.getTime());
  });

  it("lower desired retention gives longer intervals", async () => {
    const { card, now } = await walk("card-e", [3, 3]);
    const lo = await createFsrs({ desiredRetention: 0.8 });
    const hi = await createFsrs({ desiredRetention: 0.95 });
    expect(lo.preview("card-e", card, now)[GRADE.Good].getTime())
      .toBeGreaterThan(hi.preview("card-e", card, now)[GRADE.Good].getTime());
  });

  it("invalid stored config falls back to defaults instead of breaking reviews", async () => {
    const fsrs = await createFsrs({ params: [1, 2, 3], desiredRetention: 2 });
    expect(fsrs.customParams).toBe(false);
    expect(fsrs.desiredRetention).toBe(0.9);
  });

  it("validateFsrsParams rejects bad shapes", () => {
    expect(validateFsrsParams(DEFAULT_FSRS7_PARAMS).ok).toBe(true);
    expect(validateFsrsParams("x").ok).toBe(false);
    expect(validateFsrsParams(new Array(21).fill(1)).ok).toBe(false); // FSRS-6 length
    expect(validateFsrsParams([...DEFAULT_FSRS7_PARAMS.slice(0, 33), Number.NaN]).ok).toBe(false);
    expect(validateFsrsParams([...DEFAULT_FSRS7_PARAMS.slice(0, 33), "1"]).ok).toBe(false);
    const huge = [...DEFAULT_FSRS7_PARAMS];
    huge[0] = 1e9;
    expect(validateFsrsParams(huge).ok).toBe(false);
    expect(DEFAULT_FSRS7_PARAMS).toHaveLength(FSRS7_PARAM_COUNT);
  });

  it("validateDesiredRetention enforces 0.80–0.95", () => {
    expect(validateDesiredRetention(0.9)).toEqual({ ok: true, value: 0.9 });
    expect(validateDesiredRetention(0.8).ok).toBe(true);
    expect(validateDesiredRetention(0.95).ok).toBe(true);
    expect(validateDesiredRetention(0.79).ok).toBe(false);
    expect(validateDesiredRetention(0.96).ok).toBe(false);
    expect(validateDesiredRetention("0.9").ok).toBe(false);
  });
});

describe("cards created under the old (ts-fsrs v4 / FSRS-5) state shape", () => {
  // A row as migration 0018 leaves it: integer day columns, no fast trace.
  const legacy = (model: "fsrs-7" | "fsrs-5"): CardState => ({
    stability: 8.2956, stabilityFast: null, difficulty: 5.1, due: at(11), lastReview: at(3),
    state: 2, reps: 3, lapses: 0, elapsedDays: 3, scheduledDays: 8, learningStep: 0, model,
  });
  const history = [
    { grade: 3, reviewedAt: at(0) },
    { grade: 3, reviewedAt: at(1) },
    { grade: 3, reviewedAt: at(3) },
  ];

  it("complete history: must be replayed, then schedules on FSRS-7", async () => {
    const fsrs = await createFsrs();
    const card = legacy("fsrs-7");
    expect(needsReplay(card)).toBe(true);
    expect(() => fsrs.review("old-1", card, GRADE.Good, at(11))).toThrow(FsrsStateError);

    const mem = fsrs.replayMemory(history);
    expect(mem.stabilityFast).toBeGreaterThan(0);
    const rebuilt = { ...card, ...mem };
    expect(needsReplay(rebuilt)).toBe(false);
    const { card: next, log } = fsrs.review("old-1", rebuilt, GRADE.Good, at(11));
    expect(next.model).toBe("fsrs-7");
    expect(next.reps).toBe(4);
    expect(next.due.getTime()).toBeGreaterThan(at(11).getTime());
    expect(log.lastElapsedDays).toBe(3);
    expect(log.elapsedDays).toBeCloseTo(8, 5);
  });

  it("replay rebuilds exactly the state live reviews produced", async () => {
    const { fsrs, card, history: h } = await walk("card-f", [3, 1, 3, 4]);
    const mem = fsrs.replayMemory(h);
    expect(mem.stability).toBeCloseTo(card.stability, 6);
    expect(mem.stabilityFast).toBeCloseTo(card.stabilityFast!, 6);
    expect(mem.difficulty).toBeCloseTo(card.difficulty, 6);
  });

  it("incomplete history: stays on FSRS-5 and keeps scheduling", async () => {
    const fsrs = await createFsrs();
    const card = legacy("fsrs-5");
    expect(needsReplay(card)).toBe(false);
    const p = fsrs.preview("old-2", card, at(11));
    expect(p[GRADE.Good].getTime()).toBeGreaterThan(at(12).getTime());
    const { card: next, log } = fsrs.review("old-2", card, GRADE.Again, at(11));
    expect(next.model).toBe("fsrs-5");
    expect(next.stabilityFast).toBeNull();
    expect(next.lapses).toBe(1);
    expect(log.model).toBe("fsrs-5");
  });
});

describe("workload approximation", () => {
  it("fewer reviews per day at lower retention", async () => {
    const cards: CardState[] = [];
    for (let i = 0; i < 20; i++) cards.push((await walk(`w-${i}`, [3, 3])).card);
    const fsrs = await createFsrs();
    const lo = estimateDailyReviews(fsrs, cards, 0.8);
    const hi = estimateDailyReviews(fsrs, cards, 0.95);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(lo);
  });
});
