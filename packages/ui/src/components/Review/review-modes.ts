// Review variants on the exact clip (T3.11). Pure: mode metadata, the per-card
// step machine and the per-browser persistence of the chosen mode.
//
// Every mode ends in the same place — the four FSRS grade buttons. The mode only
// changes what happens *before* the grade; the grade stays the card's single
// outcome (the cloze check is shown to the user, never sent to FSRS).

export type ReviewMode = "classic" | "listen" | "cloze" | "shadow";

export const REVIEW_MODES: readonly { id: ReviewMode; label: string; hint: string }[] = [
  { id: "classic", label: "Classic", hint: "Recall the missing word, then grade." },
  { id: "listen", label: "Listen first", hint: "Hear the clip, then reveal the text and the translation." },
  { id: "cloze", label: "Cloze", hint: "Type the missing word, then grade." },
  { id: "shadow", label: "Shadow", hint: "Loop the clip and repeat it out loud. Nothing is uploaded." },
];

export function isReviewMode(value: unknown): value is ReviewMode {
  return typeof value === "string" && REVIEW_MODES.some((m) => m.id === value);
}

export const REVIEW_MODE_STORAGE_KEY = "fuchine.review.mode";

/** Read the remembered mode. Any storage failure (private mode, blocked site data) → classic. */
export function readStoredReviewMode(storage?: Pick<Storage, "getItem"> | null): ReviewMode {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    const value = s?.getItem(REVIEW_MODE_STORAGE_KEY);
    return isReviewMode(value) ? value : "classic";
  } catch {
    return "classic";
  }
}

/** Remember the mode for this browser. Best-effort: failures are swallowed. */
export function storeReviewMode(mode: ReviewMode, storage?: Pick<Storage, "setItem"> | null): void {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    s?.setItem(REVIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // per-browser convenience only
  }
}

// ---- per-card step machine -------------------------------------------------

export type ReviewStep =
  | { mode: "classic"; step: "question" | "answer" }
  | { mode: "listen"; step: "listen" | "text" | "answer" }
  | { mode: "cloze"; step: "input" }
  | { mode: "cloze"; step: "checked"; answer: string; correct: boolean }
  | { mode: "shadow"; step: "practice" };

export type ReviewStepAction =
  | { type: "reveal" }
  | { type: "submit"; answer: string; correct: boolean }
  | { type: "giveUp" }
  | { type: "reset"; mode: ReviewMode };

export function initialStep(mode: ReviewMode): ReviewStep {
  switch (mode) {
    case "classic": return { mode, step: "question" };
    case "listen": return { mode, step: "listen" };
    case "cloze": return { mode, step: "input" };
    case "shadow": return { mode, step: "practice" };
  }
}

export function reviewStepReducer(state: ReviewStep, action: ReviewStepAction): ReviewStep {
  if (action.type === "reset") return initialStep(action.mode);

  switch (state.mode) {
    case "classic":
      return action.type === "reveal" && state.step === "question" ? { mode: "classic", step: "answer" } : state;
    case "listen":
      if (action.type !== "reveal") return state;
      if (state.step === "listen") return { mode: "listen", step: "text" };
      if (state.step === "text") return { mode: "listen", step: "answer" };
      return state;
    case "cloze":
      if (state.step !== "input") return state;
      if (action.type === "submit") {
        // An empty submit is not an answer — stay on the input.
        if (action.answer.trim() === "") return state;
        return { mode: "cloze", step: "checked", answer: action.answer, correct: action.correct };
      }
      if (action.type === "giveUp") return { mode: "cloze", step: "checked", answer: "", correct: false };
      return state;
    case "shadow":
      return state;
  }
}

/** Grade buttons are offered only once the mode's reveal is complete. */
export function canGrade(state: ReviewStep): boolean {
  switch (state.mode) {
    case "classic": return state.step === "answer";
    case "listen": return state.step === "answer";
    case "cloze": return state.step === "checked";
    case "shadow": return true;
  }
}

/** Label of the dock's primary (pre-grade) button, or null when grading. */
export function primaryLabel(state: ReviewStep): string | null {
  if (canGrade(state)) return null;
  switch (state.mode) {
    case "classic": return "Show answer";
    case "listen": return state.step === "listen" ? "Show Japanese" : "Show translation";
    case "cloze": return "Show answer";
    default: return null;
  }
}

/** Whether the sentence text is visible at this step. */
export function showsSentence(state: ReviewStep): boolean {
  return !(state.mode === "listen" && state.step === "listen");
}

/** Whether the translation is visible at this step. */
export function showsTranslation(state: ReviewStep): boolean {
  if (state.mode === "listen") return state.step === "answer";
  return true;
}
