import { describe, expect, test } from "vitest";
import {
  REVIEW_MODE_STORAGE_KEY,
  canGrade,
  initialStep,
  isReviewMode,
  primaryLabel,
  readStoredReviewMode,
  reviewStepReducer,
  showsSentence,
  showsTranslation,
  storeReviewMode,
  type ReviewStep,
  type ReviewStepAction,
} from "./review-modes";

function run(start: ReviewStep, ...actions: ReviewStepAction[]): ReviewStep {
  return actions.reduce(reviewStepReducer, start);
}

describe("review mode step machine", () => {
  test("classic: question → answer, then stays", () => {
    const s0 = initialStep("classic");
    expect(canGrade(s0)).toBe(false);
    expect(primaryLabel(s0)).toBe("Show answer");
    const s1 = run(s0, { type: "reveal" });
    expect(s1).toEqual({ mode: "classic", step: "answer" });
    expect(canGrade(s1)).toBe(true);
    expect(primaryLabel(s1)).toBeNull();
    expect(run(s1, { type: "reveal" })).toEqual(s1);
  });

  test("listen: audio only → Japanese → translation, grade only at the end", () => {
    const s0 = initialStep("listen");
    expect(s0).toEqual({ mode: "listen", step: "listen" });
    expect(showsSentence(s0)).toBe(false);
    expect(showsTranslation(s0)).toBe(false);
    expect(primaryLabel(s0)).toBe("Show Japanese");

    const s1 = run(s0, { type: "reveal" });
    expect(s1.mode === "listen" && s1.step).toBe("text");
    expect(showsSentence(s1)).toBe(true);
    expect(showsTranslation(s1)).toBe(false);
    expect(canGrade(s1)).toBe(false);
    expect(primaryLabel(s1)).toBe("Show translation");

    const s2 = run(s1, { type: "reveal" });
    expect(s2).toEqual({ mode: "listen", step: "answer" });
    expect(showsTranslation(s2)).toBe(true);
    expect(canGrade(s2)).toBe(true);
    expect(run(s2, { type: "reveal" })).toEqual(s2);
  });

  test("cloze: submit records the comparison; grade stays the learner's", () => {
    const s0 = initialStep("cloze");
    expect(canGrade(s0)).toBe(false);
    const s1 = run(s0, { type: "submit", answer: "べんきょう", correct: true });
    expect(s1).toEqual({ mode: "cloze", step: "checked", answer: "べんきょう", correct: true });
    expect(canGrade(s1)).toBe(true);
    // A second submit can't overwrite the first check.
    expect(run(s1, { type: "submit", answer: "x", correct: false })).toEqual(s1);
  });

  test("cloze: an empty submit is ignored; giving up reveals as incorrect", () => {
    const s0 = initialStep("cloze");
    expect(run(s0, { type: "submit", answer: "   ", correct: false })).toEqual(s0);
    expect(run(s0, { type: "giveUp" })).toEqual({ mode: "cloze", step: "checked", answer: "", correct: false });
  });

  test("cloze ignores reveal; classic and listen ignore submit/giveUp", () => {
    expect(run(initialStep("cloze"), { type: "reveal" })).toEqual(initialStep("cloze"));
    expect(run(initialStep("classic"), { type: "giveUp" })).toEqual(initialStep("classic"));
    expect(run(initialStep("listen"), { type: "submit", answer: "a", correct: true })).toEqual(initialStep("listen"));
  });

  test("shadow: gradable straight away (practice, no score)", () => {
    const s0 = initialStep("shadow");
    expect(canGrade(s0)).toBe(true);
    expect(primaryLabel(s0)).toBeNull();
    expect(run(s0, { type: "reveal" }, { type: "giveUp" })).toEqual(s0);
  });

  test("reset jumps to the initial step of any mode", () => {
    const answered = run(initialStep("classic"), { type: "reveal" });
    expect(run(answered, { type: "reset", mode: "listen" })).toEqual(initialStep("listen"));
    expect(run(answered, { type: "reset", mode: "classic" })).toEqual(initialStep("classic"));
  });
});

describe("mode persistence", () => {
  function memory(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      data,
      getItem: (k: string) => (k in data ? data[k]! : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  test("round-trips a valid mode", () => {
    const s = memory();
    storeReviewMode("shadow", s);
    expect(s.data[REVIEW_MODE_STORAGE_KEY]).toBe("shadow");
    expect(readStoredReviewMode(s)).toBe("shadow");
  });

  test("unknown, missing or unreadable values fall back to classic", () => {
    expect(readStoredReviewMode(memory())).toBe("classic");
    expect(readStoredReviewMode(memory({ [REVIEW_MODE_STORAGE_KEY]: "karaoke" }))).toBe("classic");
    expect(readStoredReviewMode(null)).toBe("classic");
    const throwing = { getItem: () => { throw new Error("SecurityError"); } };
    expect(readStoredReviewMode(throwing)).toBe("classic");
  });

  test("a storage that throws on write is swallowed", () => {
    const throwing = { setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => storeReviewMode("cloze", throwing)).not.toThrow();
    expect(() => storeReviewMode("cloze", null)).not.toThrow();
  });

  test("isReviewMode", () => {
    expect(isReviewMode("listen")).toBe(true);
    expect(isReviewMode("LISTEN")).toBe(false);
    expect(isReviewMode(3)).toBe(false);
  });
});
