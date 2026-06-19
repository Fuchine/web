"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type FocalToken = {
  surface: string;
  lemma: string;
  reading: string | null;
  pos: string | null;
  wordEntryId: string | null;
};

export type FocalLine = {
  id: string;
  textOriginal: string;
  textTranslation: string | null;
  tokens: FocalToken[];
};

export interface PlayerFocalSubtitlesProps {
  line: FocalLine;
  showTranslation: boolean;
  showFurigana: boolean;
  activeWordId: string | null;
  onWordClick?: (wordId: string, surface: string) => void;
  onWordRef?: (wordId: string, el: HTMLElement | null) => void;
  onExplain?: () => void;
  onMine?: () => void;
  isMining?: boolean;
  className?: string;
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function renderToken(
  t: FocalToken,
  i: number,
  showFurigana: boolean,
  activeWordId: string | null,
  onWordClick?: (wordId: string, surface: string) => void,
  onWordRef?: (wordId: string, el: HTMLElement | null) => void,
): ReactNode {
  const isClickable = Boolean(t.wordEntryId && t.pos !== "Particle" && t.pos !== "Punct");
  const isActive = isClickable && activeWordId === t.wordEntryId;

  const baseClass = "jp-tok";
  const activeClass = isActive ? " active" : "";
  const clickableClass = isClickable ? " clickable" : "";

  if (showFurigana && t.reading && t.reading !== t.surface) {
    return (
      <ruby
        key={i}
        className={cn(baseClass, activeClass, clickableClass)}
        data-word-id={t.wordEntryId ?? undefined}
        ref={onWordRef ? (el) => onWordRef(t.wordEntryId ?? "", el as HTMLElement | null) : undefined}
        onClick={isClickable && onWordClick ? () => onWordClick(t.wordEntryId!, t.surface) : undefined}
      >
        {t.surface}
        <rt className="jp-rb">{t.reading}</rt>
      </ruby>
    );
  }
  return (
    <span
      key={i}
      className={cn(baseClass, activeClass, clickableClass)}
      data-word-id={t.wordEntryId ?? undefined}
      ref={onWordRef ? (el) => onWordRef(t.wordEntryId ?? "", el as HTMLElement | null) : undefined}
      onClick={isClickable && onWordClick ? () => onWordClick(t.wordEntryId!, t.surface) : undefined}
    >
      {t.surface}
    </span>
  );
}

export function PlayerFocalSubtitles({
  line,
  showTranslation,
  showFurigana,
  activeWordId,
  onWordClick,
  onWordRef,
  onExplain,
  onMine,
  isMining = false,
  className,
}: PlayerFocalSubtitlesProps) {
  const isSfx = line.textOriginal.trimStart().startsWith("♪");
  const tokens = line.tokens.length > 0
    ? line.tokens
    : line.textOriginal.split(/(\s+)/).map((surface, i) => ({
        surface,
        lemma: surface,
        reading: null,
        pos: null,
        wordEntryId: null,
      }));

  return (
    <div className={cn("focal-subs", className)}>
      <div className="focal-subs-ja jp" aria-label="Original subtitle">
        {isSfx && <span className="sfx-mark" aria-hidden="true">♪</span>}
        {tokens.map((t, i) => renderToken(t, i, showFurigana, activeWordId, onWordClick, onWordRef))}
      </div>
      {showTranslation && line.textTranslation && (
        <div className="focal-subs-en">{line.textTranslation}</div>
      )}
      <div className="focal-actions">
        {onExplain && (
          <button type="button" className="focal-btn" onClick={onExplain}>
            <SparkIcon /> Explain
          </button>
        )}
        {onMine && (
          <button
            type="button"
            className={cn("focal-btn", isMining && "on")}
            onClick={onMine}
            disabled={isMining}
            aria-busy={isMining}
          >
            <PlusIcon /> {isMining ? "Mining…" : "Mine sentence"}
          </button>
        )}
      </div>
    </div>
  );
}
