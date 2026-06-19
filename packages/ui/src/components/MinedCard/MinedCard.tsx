"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type MinedCardProps = {
  created: boolean;
  sentence: { text: string; translation: string | null };
  target: { surface: string; reading: string | null };
  video: { title: string; channel: string | null };
  time: string;
  onUndo: () => void;
  onViewDeck: () => void;
  onClose: () => void;
  className?: string;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="17" height="17">
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14">
      <rect
        x="2.5"
        y="5.5"
        width="19"
        height="13"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10 9.2v5.6l5-2.8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function renderCloze(text: string, surface: string): ReactNode {
  const idx = text.indexOf(surface);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="cloze">［ ＿＿ ］</span>
      {text.slice(idx + surface.length)}
    </>
  );
}

export function MinedCard({
  created,
  sentence,
  target,
  video,
  time,
  onUndo,
  onViewDeck,
  onClose,
  className,
}: MinedCardProps) {
  return (
    <div className={cn("mined-wrap", className)} role="status" aria-live="polite">
      <div className="mined" onClick={(e) => e.stopPropagation()}>
        <div className="mined-top">
          <span className="mined-check">
            <CheckIcon />
          </span>
          <div className="mined-titles">
            <div className="mined-title">
              {created ? "Mined to Review" : "Already mined"}
            </div>
            <div className="mined-sub">
              {created ? "1 new card · due now" : "Card already exists in your deck"}
            </div>
          </div>
          <button
            type="button"
            className="mined-x"
            onClick={onClose}
            title="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mined-card">
          <span className="mined-card-tag">Front</span>
          <div className="mined-cloze jp">
            {renderCloze(sentence.text, target.surface)}
          </div>
          {sentence.translation && (
            <div className="mined-card-en">{sentence.translation}</div>
          )}
          <div className="mined-card-foot">
            <span className="mined-target jp">
              {target.surface}
              {target.reading && <span className="r">{target.reading}</span>}
            </span>
            <span className="mined-from">
              <YoutubeIcon /> {video.title ?? video.channel ?? "Video"} · {time}
            </span>
          </div>
        </div>

        <div className="mined-actions">
          <button type="button" className="mined-btn" onClick={onUndo}>
            Undo
          </button>
          <button
            type="button"
            className="mined-btn primary"
            onClick={onViewDeck}
          >
            View deck <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
