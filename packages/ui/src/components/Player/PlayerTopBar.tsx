"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface PlayerTopBarProps {
  title: string;
  channel: string | null;
  onBack: () => void;
  /** Right-side icon buttons. Each is a small button; T1.3 wires them as no-ops. */
  onClickCaptionSettings?: () => void;
  onClickSavedWords?: () => void;
  onClickSettings?: () => void;
  className?: string;
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CaptionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="19" height="19">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="19" height="19">
      <path d="M6 4h12v17l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="19" height="19">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PlayerTopBar({
  title,
  channel,
  onBack,
  onClickCaptionSettings,
  onClickSavedWords,
  onClickSettings,
  className,
}: PlayerTopBarProps): ReactNode {
  return (
    <div className={cn("p-top", className)}>
      <button type="button" className="p-back" onClick={onBack} aria-label="Back to library" title="Back to library">
        <ChevronLeft />
      </button>
      <div className="p-titles">
        <div className="p-title jp">{title}</div>
        {channel && <div className="p-chan">{channel}</div>}
      </div>
      <div className="p-actions">
        <button
          type="button"
          className="p-iconbtn"
          onClick={onClickCaptionSettings}
          aria-label="Subtitle settings"
          title="Subtitle settings"
        >
          <CaptionIcon />
        </button>
        <button
          type="button"
          className="p-iconbtn"
          onClick={onClickSavedWords}
          aria-label="Saved words"
          title="Saved words"
        >
          <BookmarkIcon />
        </button>
        <button
          type="button"
          className="p-iconbtn"
          onClick={onClickSettings}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
