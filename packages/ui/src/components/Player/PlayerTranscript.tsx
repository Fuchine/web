"use client";

import { memo, useCallback, useMemo, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/cn";
import { showReadingFor, statusOf, type FuriganaMode, type WordStatus } from "../../lib/listening";

export type TranscriptToken = {
  surface: string;
  reading: string | null;
  romaji: string | null;
  /** Dictionary word (absent/null ⇒ not a word: no known-word color). */
  wordEntryId?: string | null;
  pos?: string | null;
};

export type TranscriptLine = {
  id: string;
  idx: number;
  tStartMs: number;
  textOriginal: string;
  textTranslation: string | null;
  tokens: TranscriptToken[];
  /**
   * i+1 (T3.10): index of the line's single unknown countable word, when
   * every other countable word is known/likely. Absent/null ⇒ not i+1.
   */
  iPlusOneIdx?: number | null;
};

export interface PlayerTranscriptProps {
  lines: TranscriptLine[];
  currentLineIdx: number;
  showTranslation: boolean;
  /** Furigana over every word, only over words not yet known, or none. */
  furigana: FuriganaMode;
  /** Per-word knowledge status (absent ⇒ unknown). */
  wordStatuses?: Readonly<Record<string, WordStatus>>;
  /** Color tokens by knowledge status. */
  colorKnown?: boolean;
  /**
   * Blur the current row's Japanese / translation — while the focal line
   * hides them (Hide JP, primed listening) the rail must not give it away.
   */
  hideCurrentJapanese?: boolean;
  hideCurrentTranslation?: boolean;
  /** Background MT pump breaker is open — surface it on the translation toggle. */
  translationsUnavailable?: boolean;
  onLineClick: (lineIdx: number) => void;
  onToggleTranslation: () => void;
  /** Cycles furigana: off → all → unknown only. */
  onCycleFurigana: () => void;
  /** When provided, shows the known-word coloring toggle (with its legend). */
  onToggleColorKnown?: () => void;
  /** i+1 filter: show only the i+1 lines (T3.10). */
  onlyIPlusOne?: boolean;
  /** When provided (and some line is i+1), shows the "Show i+1 lines" filter. */
  onToggleIPlusOne?: () => void;
  /** "Mine this i+1 line" on i+1 rows — an explicit click, never automatic. */
  onMineLine?: (lineIdx: number) => void;
  /** Lines already mined this session (the button turns into "Mined"). */
  minedLineIds?: ReadonlySet<string>;
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

function PlusOneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <path d="M4 12h6M7 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 8.5L17 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <path d="M4 17.5h4.5M10 17.5h4.5M16 17.5h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M5.5 13l2-6 2 6M6.2 11h2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 7.5h5M16.5 7.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const FURIGANA_LABEL: Record<FuriganaMode, string> = {
  off: "Furigana: off",
  all: "Furigana: all words",
  unknown: "Furigana: words you don't know yet",
};

const isWord = (t: TranscriptToken) => Boolean(t.wordEntryId) && t.pos !== "Particle" && t.pos !== "Punct";

interface TranscriptRowProps {
  line: TranscriptLine;
  isCurrent: boolean;
  furigana: FuriganaMode;
  wordStatuses?: Readonly<Record<string, WordStatus>>;
  colorKnown: boolean;
  maskJapanese: boolean;
  maskTranslation: boolean;
  showTranslation: boolean;
  formatTimecode: (ms: number) => string;
  onLineClick: (lineIdx: number) => void;
  /** Stable ref registrar keyed by line index; used by the autoscroll logic. */
  onRowRef?: (idx: number, el: HTMLButtonElement | null) => void;
  onMineLine?: (lineIdx: number) => void;
  mined: boolean;
}

// Memoized so a currentLineIdx change only re-renders the two rows whose
// isCurrent flips — not the whole (600+ line) list. Relies on the parent
// passing a stable `line` object (the transcript array is memoized upstream)
// and stable callbacks.
const TranscriptRow = memo(function TranscriptRow({
  line,
  isCurrent,
  furigana,
  wordStatuses,
  colorKnown,
  maskJapanese,
  maskTranslation,
  showTranslation,
  formatTimecode,
  onLineClick,
  onRowRef,
  onMineLine,
  mined,
}: TranscriptRowProps) {
  const tokens = line.tokens.length > 0 ? line.tokens : null;
  const ip1 = line.iPlusOneIdx != null && line.iPlusOneIdx >= 0 ? line.iPlusOneIdx : null;
  const target = ip1 != null ? line.tokens[ip1] : undefined;
  const row = (
    <button
      ref={(el) => onRowRef?.(line.idx, el)}
      type="button"
      className={cn("tr-line", isCurrent && "current", ip1 != null && "ip1")}
      data-line-idx={line.idx}
      data-i-plus-one={ip1 != null || undefined}
      onClick={() => onLineClick(line.idx)}
    >
      <span className="tr-time">
        {formatTimecode(line.tStartMs)}
        {ip1 != null && (
          <span className="tr-ip1" title={target ? `i+1: one new word, ${target.surface}` : "i+1: one new word"}>i+1</span>
        )}
      </span>
      <div>
        <div className={cn("tr-ja jp", maskJapanese && "tr-masked")} aria-hidden={maskJapanese || undefined}>
          {tokens
            ? tokens.map((t, i) => {
                const word = isWord(t);
                const status = word ? statusOf(wordStatuses, t.wordEntryId) : "unknown";
                const cls = cn(colorKnown && word && `k-${status}`, i === ip1 && "ip1-target") || undefined;
                return showReadingFor(furigana, status) && t.reading && t.reading !== t.surface ? (
                  <ruby key={i} className={cls}>
                    {t.surface}
                    <rt className="jp-rb">{t.reading}</rt>
                  </ruby>
                ) : (
                  <span key={i} className={cls}>{t.surface}</span>
                );
              })
            : line.textOriginal}
        </div>
        {showTranslation && line.textTranslation && (
          <div className={cn("tr-en", maskTranslation && "tr-masked")} aria-hidden={maskTranslation || undefined}>
            {line.textTranslation}
          </div>
        )}
      </div>
    </button>
  );
  if (ip1 == null || !onMineLine) return row;
  return (
    <div className="tr-row">
      {row}
      <button
        type="button"
        className={cn("tr-mine", mined && "done")}
        onClick={() => onMineLine(line.idx)}
        disabled={mined}
        aria-label={mined ? "Mined" : `Mine this i+1 line${target ? ` (new word: ${target.surface})` : ""}`}
      >
        {mined ? "Mined" : "Mine this i+1 line"}
      </button>
    </div>
  );
});

function PlayerTranscriptImpl({
  lines,
  currentLineIdx,
  showTranslation,
  furigana,
  wordStatuses,
  colorKnown = false,
  hideCurrentJapanese = false,
  hideCurrentTranslation = false,
  translationsUnavailable,
  onLineClick,
  onToggleTranslation,
  onCycleFurigana,
  onToggleColorKnown,
  onlyIPlusOne = false,
  onToggleIPlusOne,
  onMineLine,
  minedLineIds,
  formatTimecode,
  railRef,
  lineRefs,
  className,
}: PlayerTranscriptProps): ReactNode {
  const ip1Count = useMemo(() => lines.reduce((n, l) => n + (l.iPlusOneIdx != null ? 1 : 0), 0), [lines]);
  const shown = useMemo(
    () => (onlyIPlusOne ? lines.filter((l) => l.iPlusOneIdx != null) : lines),
    [lines, onlyIPlusOne],
  );
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
          {onToggleIPlusOne && ip1Count > 0 && (
            <button
              type="button"
              className={cn("tr-tool", onlyIPlusOne && "on")}
              onClick={onToggleIPlusOne}
              aria-label={`Show i+1 lines (${ip1Count})`}
              aria-pressed={onlyIPlusOne}
              title={`Show i+1 lines: sentences with exactly one new word (${ip1Count})`}
            >
              <PlusOneIcon />
            </button>
          )}
          {onToggleColorKnown && (
            <span className="kw-toggle">
              <button
                type="button"
                className={cn("tr-tool", colorKnown && "on")}
                onClick={onToggleColorKnown}
                aria-label="Color words by how well you know them"
                aria-pressed={colorKnown}
                aria-describedby="kw-legend"
              >
                <DotsIcon />
              </button>
              <span className="kw-legend" id="kw-legend" role="tooltip">
                <span className="kw-legend-title">Word colors</span>
                <span className="kw-legend-row"><i className="kw-swatch k-unknown" aria-hidden="true" />Unknown — new, rarely seen or looked up lately</span>
                <span className="kw-legend-row"><i className="kw-swatch k-seen" aria-hidden="true" />Likely — seen often without looking up</span>
                <span className="kw-legend-row"><i className="kw-swatch k-known" aria-hidden="true" />Confirmed — reviewed correctly or marked known</span>
              </span>
            </span>
          )}
          <button
            type="button"
            className={cn("tr-tool", furigana !== "off" && "on", furigana === "unknown" && "partial")}
            onClick={onCycleFurigana}
            aria-label={FURIGANA_LABEL[furigana]}
            aria-pressed={furigana !== "off"}
            title={`${FURIGANA_LABEL[furigana]} (click to change)`}
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
        {onlyIPlusOne && shown.length === 0 && (
          <p className="tr-empty">No i+1 lines in this video yet.</p>
        )}
        {shown.map((line) => (
          <TranscriptRow
            key={line.id}
            line={line}
            isCurrent={line.idx === currentLineIdx}
            furigana={furigana}
            wordStatuses={wordStatuses}
            colorKnown={colorKnown}
            maskJapanese={hideCurrentJapanese && line.idx === currentLineIdx}
            maskTranslation={hideCurrentTranslation && line.idx === currentLineIdx}
            showTranslation={showTranslation}
            formatTimecode={formatTimecode}
            onLineClick={onLineClick}
            onRowRef={onRowRef}
            onMineLine={onMineLine}
            mined={minedLineIds?.has(line.id) ?? false}
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
