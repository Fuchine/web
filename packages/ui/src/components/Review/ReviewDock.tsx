"use client";

import { useEffect } from "react";

export interface GradeOption {
  grade: 1 | 2 | 3 | 4;
  label: string;
  when: string;
}

export interface ReviewDockProps {
  revealed: boolean;
  grades: GradeOption[];
  onShowAnswer: () => void;
  onGrade: (grade: 1 | 2 | 3 | 4) => void;
  /** Label of the pre-grade button (default "Show answer"). */
  primaryLabel?: string;
  /** Bind Space to the pre-grade button (default true). */
  spaceShortcut?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

const clsMap: Record<string, string> = {
  1: "again",
  2: "hard",
  3: "good",
  4: "easy",
};

export function ReviewDock({
  revealed,
  grades,
  onShowAnswer,
  onGrade,
  primaryLabel = "Show answer",
  spaceShortcut = true,
}: ReviewDockProps) {
  useEffect(() => {
    if (revealed || !spaceShortcut) return;
    function handler(e: KeyboardEvent) {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        e.preventDefault();
        onShowAnswer();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed, onShowAnswer, spaceShortcut]);

  if (!revealed) {
    return (
      <div className="rev-dock">
        <button className="show-btn" onClick={onShowAnswer} type="button">
          {primaryLabel}
          {spaceShortcut && <kbd>Space</kbd>}
        </button>
      </div>
    );
  }

  return (
    <div className="rev-dock">
      <div className="grades">
        {grades.map((g) => (
          <button
            key={g.grade}
            className={`grade ${clsMap[g.grade] ?? ""}`}
            onClick={() => onGrade(g.grade)}
          >
            <span className="g-label">{g.label}</span>
            <span className="g-when">{g.when}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
