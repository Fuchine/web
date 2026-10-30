"use client";

import { type ReactNode, type Ref, useEffect, useLayoutEffect, useRef, useState } from "react";
import { freqTier, type TokenSpan } from "@fuchine/core";
import { cn } from "../../lib/cn";
import { DictPopup } from "../DictPopup/DictPopup";
import { TokenFixEditor, type FixEntryHit, type TokenFixOverride } from "../TokenFix/TokenFixEditor";

/** A token of the mined line (same shape as subtitle_lines.tokens). */
export type CurateToken = {
  surface: string;
  lemma?: string;
  reading: string | null;
  pos?: string | null;
  wordEntryId: string | null;
};

/** A dictionary entry for a token, pre-fetched with the page. */
export type CurateWordEntry = {
  lemma: string;
  reading: string;
  pos: string;
  frequencyRank: number | null;
  definitions: { glosses: string[]; partsOfSpeech: string[]; tags?: string[] }[];
};

/** The cached layer-2 explanation (read-only here). */
export type CurateExplanation = {
  breakdown: { surface: string; tag: string; gloss: string; note: string; accent?: boolean }[];
  plainTerms: string;
};

export type CurateCardStatus = "idle" | "saving" | "deleting" | "error";

export type CurateCardProps = {
  sentence: { text: string; translation: string | null };
  tokens: CurateToken[];
  wordEntries: Record<string, CurateWordEntry>;
  explanation: CurateExplanation | null;
  /** Clip position label, e.g. "5:24". */
  time: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  maxNotes?: number;
  /** The keyboard-focused card (j/k): highlighted and scrolled into view. */
  active?: boolean;
  onActivate?: () => void;
  status?: CurateCardStatus;
  error?: string | null;
  /** The clip is playing in `clip`. */
  playing?: boolean;
  /** The clip player, rendered when this card replays. */
  clip?: ReactNode;
  onReplay: () => void;
  onDelete: () => void;
  /** Mark curated with the current notes ("" = curated without notes). */
  onDone: () => void;
  /** Saved-word state + toggle for the dictionary popup (optional). */
  savedWordIds?: ReadonlySet<string>;
  onSaveWord?: (wordEntryId: string, save: boolean) => void;
  /** Origin spans of the user's token corrections (T3.7); absent = uncorrected. */
  tokenSpans?: TokenSpan[] | null;
  /**
   * Save a per-user token correction (T3.7); rejects with an Error whose
   * message is shown. When set, every word is clickable and the popup has "Fix".
   */
  onSaveTokens?: (override: TokenFixOverride) => Promise<void>;
  onResetTokens?: (span: { startIdx: number; endIdx: number }) => Promise<void>;
  onSearchEntries?: (q: string) => Promise<FixEntryHit[]>;
  notesRef?: Ref<HTMLTextAreaElement>;
  className?: string;
};

const POP_W = 324;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const btn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-[550] " +
  "cursor-pointer transition-[background-color,border-color,color] duration-150 disabled:cursor-default disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring [&_svg]:h-[15px] [&_svg]:w-[15px]";
const ghost = "border-border-strong bg-surface text-fg hover:border-faint";

/**
 * One mined card on the curation screen (T3.6, "mine now, curate later"):
 * sentence with clickable tokens (dictionary popup from pre-fetched entries),
 * translation, the cached explanation if any, a notes field and the three
 * actions — Replay clip, Delete (two-step), Done.
 */
export function CurateCard({
  sentence,
  tokens,
  wordEntries,
  explanation,
  time,
  notes,
  onNotesChange,
  maxNotes = 2000,
  active = false,
  onActivate,
  status = "idle",
  error,
  playing = false,
  clip,
  onReplay,
  onDelete,
  onDone,
  savedWordIds,
  onSaveWord,
  tokenSpans,
  onSaveTokens,
  onResetTokens,
  onSearchEntries,
  notesRef,
  className,
}: CurateCardProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const tokenRefs = useRef(new Map<number, HTMLElement>());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [popPos, setPopPos] = useState<{ left: number; bottom: number; arrowLeft: number; w: number } | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const busy = status === "saving" || status === "deleting";

  useEffect(() => {
    if (active) rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  // Two-step delete: the first press arms it for 3 s.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);

  useLayoutEffect(() => {
    setFixing(false);
    setFixError(null);
    if (openIdx == null) { setPopPos(null); return; }
    const compute = () => {
      const root = rootRef.current;
      const el = tokenRefs.current.get(openIdx);
      if (!root || !el) return;
      const s = root.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const pad = 12;
      const w = Math.min(POP_W, s.width - pad * 2);
      const center = r.left - s.left + r.width / 2;
      const left = Math.max(pad, Math.min(center - w / 2, s.width - w - pad));
      setPopPos({ left, bottom: s.height - (r.top - s.top) + 10, arrowLeft: center - left, w });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [openIdx]);

  const openToken = openIdx != null ? tokens[openIdx] : undefined;
  const openEntry = openToken?.wordEntryId ? wordEntries[openToken.wordEntryId] : undefined;
  const popupEntry = openEntry
    ? {
        word: openEntry.lemma,
        reading: openEntry.reading || null,
        pos: openEntry.pos || null,
        frequencyRank: freqTier(openEntry.frequencyRank),
        definitions: openEntry.definitions,
        lemma: openEntry.reading ? { word: openEntry.lemma, reading: openEntry.reading } : null,
      }
    : null;
  const openSaved = !!(openToken?.wordEntryId && savedWordIds?.has(openToken.wordEntryId));
  const openCorrected = openIdx != null && Boolean(tokenSpans?.[openIdx]?.corrected);
  const fixable = Boolean(onSaveTokens);

  const runFix = async (op: () => Promise<void>) => {
    setFixBusy(true);
    setFixError(null);
    try {
      await op();
      setOpenIdx(null); // token indices moved; the popup would point at the wrong word
    } catch (err) {
      setFixError(err instanceof Error && err.message ? err.message : "Could not save the correction.");
    } finally {
      setFixBusy(false);
    }
  };

  const over = notes.length > maxNotes;

  return (
    <article
      ref={rootRef}
      className={cn(
        "relative rounded-[var(--radius-lg)] border bg-surface p-4 sm:p-5 transition-[border-color,box-shadow] duration-150",
        active ? "border-accent shadow-[0_0_0_3px_var(--accent-ring)]" : "border-border",
        className,
      )}
      onMouseDown={onActivate}
      onFocus={onActivate}
      aria-current={active ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="jp m-0 text-[20px] leading-[1.7] text-fg" lang="ja">
          {tokens.length > 0
            ? tokens.map((t, i) =>
                t.wordEntryId || (fixable && !/^[\s\p{P}\p{S}]+$/u.test(t.surface)) ? (
                  <button
                    key={i}
                    type="button"
                    ref={(el) => { if (el) tokenRefs.current.set(i, el); else tokenRefs.current.delete(i); }}
                    className={cn(
                      "cursor-pointer rounded-[4px] border-0 bg-transparent p-0 font-[inherit] text-[inherit] text-fg",
                      "underline decoration-1 underline-offset-[5px] hover:bg-accent-soft",
                      t.wordEntryId ? "decoration-border-strong" : "decoration-dotted decoration-border",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                      openIdx === i && "bg-accent-soft",
                    )}
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    title={t.reading ?? undefined}
                  >
                    {t.surface}
                  </button>
                ) : (
                  <span key={i}>{t.surface}</span>
                ),
              )
            : sentence.text}
        </p>
        <span className="mt-1.5 shrink-0 text-[12px] tabular-nums text-faint">{time}</span>
      </div>
      {sentence.translation && (
        <p className="m-0 mt-1 text-[14px] leading-[1.5] text-muted">{sentence.translation}</p>
      )}

      {explanation && (
        <div className="mt-3">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-[550] text-link hover:text-link-hover"
            onClick={() => setShowExplain((v) => !v)}
            aria-expanded={showExplain}
          >
            {showExplain ? "Hide explanation" : "Show explanation"}
          </button>
          {showExplain && (
            <div className="mt-2 rounded-[10px] bg-bg-2 p-3 text-[13px] leading-[1.55] text-fg">
              <p className="m-0">{explanation.plainTerms}</p>
              {explanation.breakdown.length > 0 && (
                <ul className="m-0 mt-2 list-none space-y-1 p-0">
                  {explanation.breakdown.map((part, i) => (
                    <li key={i}>
                      <span className={cn("jp font-[600]", part.accent && "text-link")} lang="ja">{part.surface}</span>
                      <span className="text-muted"> — {part.gloss}. {part.note}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 mt-2 text-[11.5px] text-faint">AI-generated · cached</p>
            </div>
          )}
        </div>
      )}

      {clip && <div className="mt-3 aspect-video w-full max-w-[480px]">{clip}</div>}

      <label className="mt-3 block">
        <span className="sr-only">Notes</span>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (!busy && !over) onDone();
            } else if (e.key === "Escape") {
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          rows={2}
          placeholder="Notes (optional) — meaning, grammar, why you mined it"
          className={cn(
            "block w-full resize-y rounded-[10px] border bg-field px-3 py-2 text-[14px] leading-[1.5] text-fg",
            "placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent-ring",
            over ? "border-error" : "border-border",
          )}
          aria-invalid={over || undefined}
        />
      </label>
      {(over || notes.length > maxNotes * 0.9) && (
        <p className={cn("m-0 mt-1 text-right text-[11.5px]", over ? "text-error" : "text-faint")}>
          {notes.length} / {maxNotes}
        </p>
      )}
      {error && <p className="m-0 mt-1 text-[12.5px] text-error" role="alert">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={cn(btn, ghost, playing && "border-accent text-link")} onClick={onReplay}>
          <PlayIcon /> {playing ? "Playing…" : "Replay clip"}
        </button>
        <button
          type="button"
          className={cn(btn, confirmDelete ? "border-error bg-surface text-error" : ghost)}
          disabled={busy}
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            setConfirmDelete(false);
            onDelete();
          }}
        >
          <TrashIcon /> {status === "deleting" ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete"}
        </button>
        <button
          type="button"
          className={cn(btn, "ml-auto border-accent bg-accent text-on-accent hover:bg-accent-hover")}
          disabled={busy || over}
          onClick={onDone}
          title={notes.trim() ? "Save notes and mark curated" : "Mark curated without notes"}
        >
          <CheckIcon /> {status === "saving" ? "Saving…" : notes.trim() ? "Done" : "Done · no notes"}
        </button>
      </div>

      {popPos && openIdx != null && (
        <DictPopup
          position={popPos}
          entry={popupEntry}
          loading={false}
          error={popupEntry ? null : "No dictionary entry."}
          saved={openSaved}
          onExplain={() => { setOpenIdx(null); if (explanation) setShowExplain(true); }}
          onSaveWord={() => { if (openToken?.wordEntryId) onSaveWord?.(openToken.wordEntryId, !openSaved); }}
          onClose={() => setOpenIdx(null)}
          onFix={fixable ? () => setFixing(true) : undefined}
          corrected={openCorrected}
          fixEditor={fixing && onSaveTokens ? (
            <TokenFixEditor
              key={openIdx}
              tokens={tokens}
              spans={tokenSpans}
              index={openIdx}
              onSave={(o) => runFix(() => onSaveTokens(o))}
              onReset={(span) => runFix(() => (onResetTokens ? onResetTokens(span) : Promise.resolve()))}
              onSearch={onSearchEntries}
              onCancel={() => setFixing(false)}
              error={fixError}
              busy={fixBusy}
            />
          ) : undefined}
        />
      )}
    </article>
  );
}
