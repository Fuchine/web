"use client";

import { type ReactNode } from "react";
import { hiraToRomaji, kataToHira } from "@fuchine/nlp/client";
import { cn } from "../../lib/cn";
import { statusOf, type PrimedPhase, type WordStatus } from "../../lib/listening";

// Fallback when a token has no stored romaji: the shared converter from
// @fuchine/nlp (handles digraphs and the small っ), never a local copy.
function readingToRomaji(reading: string): string {
  return hiraToRomaji(kataToHira(reading));
}

export type FocalToken = {
  surface: string;
  lemma: string;
  reading: string | null;
  romaji: string | null;
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
  showRomaji: boolean;
  /** Hide the Japanese line (Hide JP toggle, or a primed-listening phase). Default true. */
  showJapanese?: boolean;
  /** Primed-listening phase, for the small phase cue (idle/absent ⇒ none). */
  primedPhase?: PrimedPhase;
  /** Per-word knowledge status (absent ⇒ unknown). Colors tokens when colorKnown. */
  wordStatuses?: Readonly<Record<string, WordStatus>>;
  colorKnown?: boolean;
  activeWordId: string | null;
  onWordClick?: (wordId: string, surface: string) => void;
  onWordRef?: (wordId: string, el: HTMLElement | null) => void;
  /**
   * Token-index click (T3.7): when set, every word token is clickable —
   * including ones without a dictionary entry, so they can be fixed — and
   * keyboard-focusable. Takes precedence over onWordClick.
   */
  onTokenClick?: (index: number, wordId: string | null, surface: string) => void;
  onTokenRef?: (index: number, el: HTMLElement | null) => void;
  /** The token whose popup is open (with onTokenClick). */
  activeTokenIdx?: number | null;
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

const PHASE_CUE: Partial<Record<PrimedPhase, string>> = {
  preview: "Primed · read the meaning",
  listen: "Primed · listen",
  reveal: "Primed · check what you heard",
};

type TokenHandlers = {
  activeWordId: string | null;
  onWordClick?: (wordId: string, surface: string) => void;
  onWordRef?: (wordId: string, el: HTMLElement | null) => void;
  onTokenClick?: (index: number, wordId: string | null, surface: string) => void;
  onTokenRef?: (index: number, el: HTMLElement | null) => void;
  activeTokenIdx?: number | null;
};

const PUNCT_RE = /^[\s\p{P}\p{S}]+$/u;

function renderToken(
  t: FocalToken,
  i: number,
  showRomaji: boolean,
  status: WordStatus | null,
  h: TokenHandlers,
): ReactNode {
  const { activeWordId, onWordClick, onWordRef, onTokenClick, onTokenRef, activeTokenIdx } = h;
  const byIndex = Boolean(onTokenClick);
  const isClickable = byIndex
    ? t.pos !== "Particle" && t.pos !== "Punct" && !PUNCT_RE.test(t.surface)
    : Boolean(t.wordEntryId && t.pos !== "Particle" && t.pos !== "Punct");
  const isActive = isClickable && (byIndex ? activeTokenIdx === i : activeWordId === t.wordEntryId);
  const isPunct = t.pos === "Punct";
  const isParticle = t.pos === "Particle";
  const romaji = t.romaji ?? (t.reading ? readingToRomaji(t.reading) : "");

  let wordClass = "word";
  if (isPunct) wordClass += " punct";
  if (isParticle) wordClass += " particle";
  if (isActive) wordClass += " active";
  if (status && isClickable) wordClass += ` k-${status}`;

  if (isPunct) {
    return (
      <span key={i} className={wordClass} aria-hidden="true">
        {showRomaji && <span className="w-romaji" />}
        <span className="w-kanji">{t.surface}</span>
      </span>
    );
  }

  if (isParticle) {
    return (
      <span key={i} className={wordClass}>
        {showRomaji && <span className="w-romaji">{romaji}</span>}
        <span className="w-kanji">{t.surface}</span>
      </span>
    );
  }

  if (byIndex) {
    const activate = () => onTokenClick!(i, t.wordEntryId, t.surface);
    return (
      <span key={i} className={wordClass}>
        {showRomaji && <span className="w-romaji">{romaji}</span>}
        <span
          ref={onTokenRef ? (el) => onTokenRef(i, el as HTMLElement | null) : undefined}
          className="w-kanji"
          role={isClickable ? "button" : undefined}
          tabIndex={isClickable ? 0 : undefined}
          aria-expanded={isClickable ? isActive : undefined}
          onClick={isClickable ? activate : undefined}
          onKeyDown={isClickable ? (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
          } : undefined}
        >
          {t.surface}
        </span>
      </span>
    );
  }

  return (
    <span key={i} className={wordClass}>
      {showRomaji && <span className="w-romaji">{romaji}</span>}
      <span
        ref={onWordRef ? (el) => onWordRef(t.wordEntryId ?? "", el as HTMLElement | null) : undefined}
        className="w-kanji"
        onClick={isClickable && onWordClick ? () => onWordClick(t.wordEntryId!, t.surface) : undefined}
      >
        {t.surface}
      </span>
    </span>
  );
}

export function PlayerFocalSubtitles({
  line,
  showTranslation,
  showFurigana,
  showRomaji,
  showJapanese = true,
  primedPhase,
  wordStatuses,
  colorKnown = false,
  activeWordId,
  onWordClick,
  onWordRef,
  onTokenClick,
  onTokenRef,
  activeTokenIdx,
  onExplain,
  onMine,
  isMining = false,
  className,
}: PlayerFocalSubtitlesProps) {
  const cue = primedPhase ? PHASE_CUE[primedPhase] : undefined;
  const isSfx = line.textOriginal.trimStart().startsWith("♪");
  const tokens = line.tokens.length > 0
    ? line.tokens
    : line.textOriginal.split(/(\s+)/).map((surface, i) => ({
        surface,
        lemma: surface,
        reading: null,
        romaji: null,
        pos: null,
        wordEntryId: null,
      }));

  return (
    <div className={cn("focal-subs", className)}>
      {cue && <div className={cn("focal-phase", `is-${primedPhase}`)}>{cue}</div>}
      <div className="focal-ja-wrap">
        <div
          className={cn("focal-subs-ja jp", showRomaji && "has-romaji", !showJapanese && "is-masked")}
          aria-label="Original subtitle"
          aria-hidden={showJapanese ? undefined : true}
        >
          {isSfx && <span className="sfx-mark" aria-hidden="true">♪</span>}
          {tokens.map((t, i) =>
            renderToken(t, i, showRomaji, colorKnown ? statusOf(wordStatuses, t.wordEntryId) : null, {
              activeWordId, onWordClick, onWordRef,
              // Index-addressed clicks only make sense on real tokens.
              onTokenClick: line.tokens.length > 0 ? onTokenClick : undefined,
              onTokenRef, activeTokenIdx,
            }),
          )}
        </div>
        {!showJapanese && <div className="focal-mask">Japanese hidden</div>}
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
