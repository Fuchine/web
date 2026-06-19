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
  onExplain?: () => void;
  className?: string;
}

function renderToken(t: FocalToken, i: number, showFurigana: boolean): ReactNode {
  if (showFurigana && t.reading && t.reading !== t.surface) {
    return (
      <ruby key={i} className="jp-tok">
        {t.surface}
        <rt className="jp-rb">{t.reading}</rt>
      </ruby>
    );
  }
  return (
    <span key={i} className="jp-tok" data-word-id={t.wordEntryId ?? "null"}>
      {t.surface}
    </span>
  );
}

export function PlayerFocalSubtitles({
  line,
  showTranslation,
  showFurigana,
  onExplain,
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
        {tokens.map((t, i) => renderToken(t, i, showFurigana))}
      </div>
      {showTranslation && line.textTranslation && (
        <div className="focal-subs-en">{line.textTranslation}</div>
      )}
      {onExplain && (
        <div className="focal-actions">
          <button type="button" className="focal-btn" onClick={onExplain}>Explain</button>
        </div>
      )}
    </div>
  );
}
