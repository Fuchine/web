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
}

const clsMap: Record<string, string> = {
  1: "again",
  2: "hard",
  3: "good",
  4: "easy",
};

export function ReviewDock({ revealed, grades, onShowAnswer, onGrade }: ReviewDockProps) {
  useEffect(() => {
    if (revealed) return;
    function handler(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        onShowAnswer();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed, onShowAnswer]);

  if (!revealed) {
    return (
      <div className="rev-dock">
        <button className="show-btn" onClick={onShowAnswer}>
          Show answer
          <kbd>Space</kbd>
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
