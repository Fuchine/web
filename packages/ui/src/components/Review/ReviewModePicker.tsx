"use client";

import { cn } from "../../lib/cn";
import { REVIEW_MODES, type ReviewMode } from "./review-modes";

export interface ReviewModePickerProps {
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
}

/** Segmented control for the session's review mode (T3.11). */
export function ReviewModePicker({ mode, onChange }: ReviewModePickerProps) {
  const current = REVIEW_MODES.find((m) => m.id === mode) ?? REVIEW_MODES[0]!;
  return (
    <div className="rev-modes">
      <div className="rev-modes-seg" role="radiogroup" aria-label="Review mode">
        {REVIEW_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === mode}
            className={cn("rev-mode", m.id === mode && "active")}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="rev-modes-hint">{current.hint}</p>
    </div>
  );
}
