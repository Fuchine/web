"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { posLabel } from "../../lib/pos";
import { Skeleton } from "../Skeleton/Skeleton";
import { PitchAccent, type PitchInfo } from "../PitchAccent/PitchAccent";
import {
  DictFrequencyChips,
  DictSections,
  type DictFrequencyInfo,
  type DictSectionInfo,
} from "../DictSources/DictSources";

export type DictPopupProps = {
  position: { left: number; bottom: number; arrowLeft: number; w: number };
  entry: {
    word: string;
    reading: string | null;
    pos: string | null;
    frequencyRank: number | null;
    definitions: { glosses: string[]; partsOfSpeech: string[]; tags?: string[] }[];
    lemma?: { word: string; reading: string } | null;
    /** Pitch accent per source (T3.2); omitted or empty = nothing shown. */
    pitch?: PitchInfo[] | null;
    /** The user's enabled imported dictionaries, in their order (T3.4). */
    dictionaries?: DictSectionInfo[] | null;
    /** Ranks from the user's enabled frequency lists (T3.4). */
    frequencies?: DictFrequencyInfo[] | null;
  } | null;
  loading: boolean;
  error: string | null;
  saved: boolean;
  onExplain: () => void;
  onSaveWord: () => void;
  onClose: () => void;
  /**
   * One-click "Mark as unknown" (T3.9): writes the manual override that keeps
   * the word out of the known tiers. Absent = no button. With `markedUnknown`
   * the button undoes it.
   */
  onMarkUnknown?: () => void;
  markedUnknown?: boolean;
  /** Open the per-user token correction editor (T3.7). Absent = no "Fix". */
  onFix?: () => void;
  /** The token is a correction saved by this user ("Corrected by you"). */
  corrected?: boolean;
  /** When set, the popup shows this (the TokenFixEditor) instead of the entry. */
  fixEditor?: ReactNode;
  className?: string;
};

const FREQ_LABEL = ["", "Rare", "Uncommon", "Common", "Common", "Very common"];

function FreqDots({ n }: { n: number }) {
  return (
    <span className="dp-freq">
      <span className="dots">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= n ? "on" : ""} />
        ))}
      </span>
      <span className="flabel">{FREQ_LABEL[n] ?? ""}</span>
    </span>
  );
}

function DictPopupSkeleton(): ReactNode {
  return (
    <div aria-busy="true" aria-label="Loading definition" className="dp-skeleton">
      <div className="dp-sk-head">
        <div>
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="mt-1.5 h-4 w-16 rounded-md" />
        </div>
      </div>
      <div className="dp-sk-tags">
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="dp-sk-defs">
        {[0, 1].map((i) => (
          <div key={i} className="dp-sk-def">
            <Skeleton className="h-3.5 w-4 rounded" />
            <Skeleton className="h-3.5 flex-1 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
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

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookmarkFillIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M14.5 5.5a4 4 0 0 0-5 5L4.8 15.2a1.8 1.8 0 0 0 2.5 2.5l4.7-4.7a4 4 0 0 0 5-5l-2.4 2.4-2.1-.4-.4-2.1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="17" height="17">
      <path
        d="M4 9.5h3L11 6v12L7 14.5H4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 9.2a4 4 0 0 1 0 5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DictPopup({
  position,
  entry,
  loading,
  error,
  saved,
  onExplain,
  onSaveWord,
  onClose,
  onFix,
  onMarkUnknown,
  markedUnknown = false,
  corrected = false,
  fixEditor,
  className,
}: DictPopupProps) {
  const freq = entry?.frequencyRank ?? 0;

  return (
    <>
      <div className="dict-scrim" onClick={onClose} />
      <div
        className={cn("dict-pop", className)}
        style={{ left: position.left, bottom: position.bottom, width: position.w }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dictionary popup"
      >
        <div className="dict-arrow" style={{ left: position.arrowLeft - 6 }} />

        {fixEditor}

        {!fixEditor && loading && <DictPopupSkeleton />}

        {!fixEditor && error && !loading && (
          <div className="dp-error">
            <span>{error}</span>
            {corrected && <span className="dp-corrected">Corrected by you</span>}
            {onFix && (
              <button type="button" className="dp-action fix" onClick={onFix}>
                <WrenchIcon /> Fix
              </button>
            )}
          </div>
        )}

        {!fixEditor && !loading && !error && entry && (
          <>
            <div className="dp-head">
              <div>
                <div className="dp-word jp">{entry.word}</div>
                {entry.reading && <div className="dp-reading jp">{entry.reading}</div>}
              </div>
              <div className="dp-actions">
                <button
                  type="button"
                  className={cn("dp-save", saved && "saved")}
                  onClick={onSaveWord}
                  title={saved ? "Saved" : "Save word"}
                >
                  {saved ? <BookmarkFillIcon /> : <BookmarkIcon />}
                </button>
                <button
                  type="button"
                  className="dp-icon"
                  title="Hear pronunciation"
                >
                  <VolumeIcon />
                </button>
              </div>
            </div>

            <div className="dp-tags">
              {entry.pos && <span className="dp-pos">{posLabel(entry.pos)}</span>}
              {freq > 0 && <FreqDots n={freq} />}
              <DictFrequencyChips frequencies={entry.frequencies} />
              {corrected && <span className="dp-corrected">Corrected by you</span>}
            </div>

            <PitchAccent pitch={entry.pitch} className="dp-pitch" />

            {entry.lemma && (
              <div className="dp-lemma">
                <span className="k">Dictionary form</span>
                <span className="v jp">
                  {entry.lemma.word}
                  <span className="r">{entry.lemma.reading}</span>
                </span>
              </div>
            )}

            <ol className="dp-defs">
              {entry.definitions.map((def, i) => (
                <li key={i}>
                  <span className="n">{i + 1}</span>
                  <div>
                    <div className="dp-def-text">{def.glosses.join("; ")}</div>
                    {def.tags && def.tags.length > 0 && (
                      <div className="dp-def-tags">
                        {def.tags.map((tag) => (
                          <span key={tag} className="dp-def-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <DictSections sections={entry.dictionaries} />

            <div className="dp-foot">
              <button type="button" className="dp-action primary" onClick={onExplain}>
                <SparkIcon /> Explain
              </button>
              <button
                type="button"
                className={cn("dp-action save", saved && "saved")}
                onClick={onSaveWord}
              >
                {saved ? <BookmarkFillIcon /> : <BookmarkIcon />}{" "}
                {saved ? "Saved" : "Save word"}
              </button>
              {onMarkUnknown && (
                <button
                  type="button"
                  className={cn("dp-action unknown", markedUnknown && "on")}
                  onClick={onMarkUnknown}
                  aria-pressed={markedUnknown}
                  title={markedUnknown
                    ? "Marked unknown: it doesn't count as known in your coverage. Click to undo"
                    : "Don't count this word as known in your coverage (also saves it)"}
                >
                  {markedUnknown ? "Marked unknown" : "Mark as unknown"}
                </button>
              )}
              {onFix && (
                <button
                  type="button"
                  className="dp-action fix"
                  onClick={onFix}
                  title="Wrong word boundary, reading or entry? Fix it for you"
                >
                  <WrenchIcon /> Fix
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
