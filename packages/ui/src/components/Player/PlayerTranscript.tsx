"use client";

import { forwardRef, type ButtonHTMLAttributes, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/cn";

export type TranscriptToken = {
  surface: string;
  reading: string | null;
};

export type TranscriptLine = {
  id: string;
  idx: number;
  tStartMs: number;
  textOriginal: string;
  textTranslation: string | null;
  tokens: TranscriptToken[];
};

export interface PlayerTranscriptProps {
  lines: TranscriptLine[];
  currentLineIdx: number;
  showTranslation: boolean;
  showFurigana: boolean;
  onLineClick: (lineIdx: number) => void;
  onToggleTranslation: () => void;
  onToggleFurigana: () => void;
  formatTimecode: (ms: number) => string;
  /** Ref to the scrollable region (used by the autoscroll logic). */
  railRef?: RefObject<HTMLDivElement | null>;
  /** Ref to the map of per-row buttons. */
  lineRefs?: MutableRefObject<Map<number, HTMLButtonElement>>;
  className?: string;
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <path d="M5 6h14M9 6v12M5 18h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const Row = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; children: ReactNode }>(
  function Row({ active, children, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn("tr-line", active && "current", className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export function PlayerTranscript({
  lines,
  currentLineIdx,
  showTranslation,
  showFurigana,
  onLineClick,
  onToggleTranslation,
  onToggleFurigana,
  formatTimecode,
  railRef,
  lineRefs,
  className,
}: PlayerTranscriptProps): ReactNode {
  return (
    <aside className={cn("rail", className)} aria-label="Transcript">
      <div className="rail-tabs">
        <button type="button" className="rail-tab on" aria-current="page" tabIndex={-1}>
          <SearchIcon /> Transcript
        </button>
      </div>
      <div className="tr-sub">
        <div className="tr-tools">
          <button
            type="button"
            className={cn("tr-tool", showFurigana && "on")}
            onClick={onToggleFurigana}
            aria-label="Show furigana"
            aria-pressed={showFurigana}
            title="Furigana"
          >
            <TextIcon />
          </button>
          <button
            type="button"
            className={cn("tr-tool", showTranslation && "on")}
            onClick={onToggleTranslation}
            aria-label="Show translation"
            aria-pressed={showTranslation}
            title="Translation"
          >
            <TextIcon />
          </button>
        </div>
      </div>
      <div className="tr-list" ref={railRef}>
        {lines.map((line) => {
          const active = line.idx === currentLineIdx;
          const tokens = line.tokens.length > 0 ? line.tokens : null;
          return (
            <Row
              key={line.id}
              ref={(el) => {
                if (!lineRefs) return;
                if (el) lineRefs.current.set(line.idx, el);
                else lineRefs.current.delete(line.idx);
              }}
              active={active}
              data-line-idx={line.idx}
              onClick={() => onLineClick(line.idx)}
            >
              <span className="tr-time">{formatTimecode(line.tStartMs)}</span>
              <div>
                <div className="tr-ja jp">
                  {tokens
                    ? tokens.map((t, i) =>
                        showFurigana && t.reading && t.reading !== t.surface ? (
                          <ruby key={i}>
                            {t.surface}
                            <rt className="jp-rb">{t.reading}</rt>
                          </ruby>
                        ) : (
                          <span key={i}>{t.surface}</span>
                        ),
                      )
                    : line.textOriginal}
                </div>
                {showTranslation && line.textTranslation && (
                  <div className="tr-en">{line.textTranslation}</div>
                )}
              </div>
            </Row>
          );
        })}
      </div>
    </aside>
  );
}
