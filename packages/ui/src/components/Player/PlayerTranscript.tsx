"use client";

import { memo, useCallback, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/cn";

export type TranscriptToken = {
  surface: string;
  reading: string | null;
  romaji: string | null;
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
  /** Background MT pump breaker is open — surface it on the translation toggle. */
  translationsUnavailable?: boolean;
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
      <path d="M5 7V5.5h14V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 5.5v13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.5 18.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CcIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 11.5a1.5 1.5 0 1 1 1.5 1.5M14 11.5a1.5 1.5 0 1 1 1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

interface TranscriptRowProps {
  line: TranscriptLine;
  isCurrent: boolean;
  showFurigana: boolean;
  showTranslation: boolean;
  formatTimecode: (ms: number) => string;
  onLineClick: (lineIdx: number) => void;
  /** Stable ref registrar keyed by line index; used by the autoscroll logic. */
  onRowRef?: (idx: number, el: HTMLButtonElement | null) => void;
}

// Memoized so a currentLineIdx change only re-renders the two rows whose
// isCurrent flips — not the whole (600+ line) list. Relies on the parent
// passing a stable `line` object (the transcript array is memoized upstream)
// and stable callbacks.
const TranscriptRow = memo(function TranscriptRow({
  line,
  isCurrent,
  showFurigana,
  showTranslation,
  formatTimecode,
  onLineClick,
  onRowRef,
}: TranscriptRowProps) {
  const tokens = line.tokens.length > 0 ? line.tokens : null;
  return (
    <button
      ref={(el) => onRowRef?.(line.idx, el)}
      type="button"
      className={cn("tr-line", isCurrent && "current")}
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
    </button>
  );
});

function PlayerTranscriptImpl({
  lines,
  currentLineIdx,
  showTranslation,
  showFurigana,
  translationsUnavailable,
  onLineClick,
  onToggleTranslation,
  onToggleFurigana,
  formatTimecode,
  railRef,
  lineRefs,
  className,
}: PlayerTranscriptProps): ReactNode {
  // Stable registrar so the memoized rows don't re-render on every parent tick.
  const onRowRef = useCallback(
    (idx: number, el: HTMLButtonElement | null) => {
      if (!lineRefs) return;
      if (el) lineRefs.current.set(idx, el);
      else lineRefs.current.delete(idx);
    },
    [lineRefs],
  );
  return (
    <>
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
            <CcIcon />
          </button>
          <button
            type="button"
            className={cn("tr-tool", showTranslation && "on")}
            onClick={onToggleTranslation}
            aria-label="Show translation"
            aria-pressed={showTranslation}
            title={translationsUnavailable ? "Translations are temporarily unavailable — Japanese only for now." : "Translation"}
          >
            <TextIcon />
          </button>
        </div>
      </div>
      <div className="tr-list" ref={railRef}>
        {lines.map((line) => (
          <TranscriptRow
            key={line.id}
            line={line}
            isCurrent={line.idx === currentLineIdx}
            showFurigana={showFurigana}
            showTranslation={showTranslation}
            formatTimecode={formatTimecode}
            onLineClick={onLineClick}
            onRowRef={onRowRef}
          />
        ))}
      </div>
    </>
  );
}

// Memoized: on a currentMs-only tick (4×/s during playback) none of these props
// change, so the whole transcript is skipped. Requires the parent to pass a
// stable `lines` array and stable callbacks (see Player.tsx).
export const PlayerTranscript = memo(PlayerTranscriptImpl);
