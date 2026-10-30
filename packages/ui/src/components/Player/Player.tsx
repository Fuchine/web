"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { UserFacingError } from "../../lib/errors";
import { cn } from "../../lib/cn";
import { pickPrefetchTarget } from "../../lib/prefetch";
import { rewatchTick, startRewatch, type RewatchEffect, type RewatchPlan } from "../../lib/rewatch";
import {
  DEFAULT_PLAYER_PREFS,
  FURIGANA_MODES,
  LISTENING_MODES,
  PRIMED_IDLE,
  lineAtOrAfter,
  loadPlayerPrefs,
  nextInCycle,
  primedStep,
  savePlayerPrefs,
  statusOf,
  subtitleVisibility,
  type PlayerPrefs,
  type PrimedEvent,
  type PrimedLine,
  type PrimedState,
  type WordStatus,
} from "../../lib/listening";
import { AppShell } from "../AppShell/AppShell";
import { buildAppNav } from "../AppShell/nav";
import { pickCurrentLine, formatTimecode as fmt, lineHasAudio, chunkIndexForLine, chunkPumpOrder, freqTier, type TokenSpan } from "@fuchine/core";
import { TokenFixEditor, type FixEntryHit, type TokenFixOverride } from "../TokenFix/TokenFixEditor";
import { PlayerTopBar } from "./PlayerTopBar";
import { PlayerStage, type PlayerVideoHandle, type DictPopupState } from "./PlayerStage";
import { PlayerTranscript, type TranscriptLine, type TranscriptToken } from "./PlayerTranscript";
import type { FocalLine, FocalToken } from "./PlayerFocalSubtitles";
import { RATES, type PlaybackRate } from "./PlayerControlBar";
import { PlayerExplain, type ExplainFocal } from "./PlayerExplain";
import type { Explanation, WordEntry } from "@fuchine/db";
import type { PitchInfo } from "../PitchAccent/PitchAccent";

/** GET /api/dictionary?id= payload: the row plus its pitch accent (T3.2). */
type DictApiEntry = WordEntry & { pitch?: PitchInfo[] };

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <path d="M8 6.5h12M8 12h12M8 17.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 6.5h.01M4 12h.01M4 17.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z" fill="currentColor" />
    </svg>
  );
}

export type PlayerVideo = {
  id: string;
  title: string;
  channel: string | null;
  sourceId: string;
};

export type PlayerSubtitleLine = {
  id: string;
  idx: number;
  tStartMs: number;
  tEndMs: number;
  textOriginal: string;
  textTranslation: string | null;
  tokens: { surface: string; lemma: string; reading: string | null; romaji: string | null; pos: string | null; wordEntryId: string | null }[];
  /** Origin spans of the user's token corrections (T3.7); absent = uncorrected. */
  tokenSpans?: TokenSpan[] | null;
};

/** A line's tokens as the user now sees them, after a correction save/reset. */
export type LineTokensUpdate = {
  tokens: PlayerSubtitleLine["tokens"];
  tokenSpans: TokenSpan[] | null;
};

export interface PlayerProps {
  video: PlayerVideo;
  lines: PlayerSubtitleLine[];
  account?: { name: string; sub?: string; initials?: string };
  /** Chunks already translated (from the server payload). */
  translatedChunks?: number[];
  /** Fetch & persist translations for a chunk; resolves with the updated rows. */
  onFetchChunk?: (chunkIdx: number) => Promise<{ id: string; textTranslation: string | null }[]>;
  /** Fetch (and cache) the layer-2 explanation for a line. force = regenerate. */
  onFetchExplanation?: (lineId: string, opts?: { force?: boolean }) => Promise<Explanation>;
  /** PROMPT_VERSION reported by the explain API, shown in the Explain panel label (T3.12). */
  explanationPromptVersion?: number | null;
  onBack: () => void;
  onNavigate?: (key: string) => void;
  /** Deep-link: focus + seek to this line on load (from the dictionary). */
  initialLineId?: string;
  /** word_entry ids the user has bookmarked (initial state for the popup). */
  savedWordIds?: string[];
  /** Persist a bookmark toggle; resolves to the new saved state. */
  onSaveWord?: (wordEntryId: string, save: boolean) => Promise<boolean>;
  /** Batched study-activity beacon: watch time + lines seen since the last call. */
  onProgress?: (progress: { msWatched: number; lineIds: string[] }) => void;
  /**
   * Known-word signals for this video's words (server-computed per user;
   * absent ⇒ unknown). Colors tokens and drives "furigana: unknown only".
   */
  wordStatuses?: Readonly<Record<string, WordStatus>>;
  /**
   * Per-user token correction (T3.7). When set, every word in the focal line
   * opens the popup (even without an entry) and the popup offers "Fix".
   */
  onSaveTokens?: (lineId: string, override: TokenFixOverride) => Promise<LineTokensUpdate>;
  /** Reset a correction block (span) or the whole line (null). */
  onResetTokens?: (lineId: string, span: { startIdx: number; endIdx: number } | null) => Promise<LineTokensUpdate>;
  /** Dictionary search for the Fix editor's entry picker. */
  onSearchEntries?: (q: string) => Promise<FixEntryHit[]>;
  className?: string;
}

const POLL_MS = 250;
const PROGRESS_FLUSH_MS = 15_000;
const SCROLL_GRACE_MS = 1200;
const CLICK_GRACE_MS = 600;
const PREFETCH_AHEAD = 6;
const PREFETCH_CONCURRENCY = 3;
const PREFETCH_WAIT_MS = 30_000;
// Background translation pump: wait between consecutive failures, then open the
// circuit breaker so a downed MT provider isn't hammered chunk-by-chunk.
const PUMP_BACKOFFS_MS = [1000, 4000, 15000];
const PUMP_BREAKER_THRESHOLD = 3;

// localStorage can be missing or throw (private mode, blocked site data).
function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

// Primed listening previews a line only when there's a translation to show.
function toPrimedLines(lines: PlayerSubtitleLine[], translations: Map<string, string | null>): PrimedLine[] {
  return lines.map((l) => ({ tStartMs: l.tStartMs, tEndMs: l.tEndMs, preview: Boolean(translations.get(l.id)) }));
}

function toFocal(
  line: PlayerSubtitleLine | undefined,
  translations: Map<string, string | null>,
): FocalLine | null {
  if (!line) return null;
  return {
    id: line.id,
    textOriginal: line.textOriginal,
    textTranslation: translations.get(line.id) ?? null,
    tokens: line.tokens.map<FocalToken>((t) => ({
      surface: t.surface,
      lemma: t.lemma,
      reading: t.reading,
      romaji: t.romaji,
      pos: t.pos,
      wordEntryId: t.wordEntryId,
    })),
  };
}

function toTranscript(
  lines: PlayerSubtitleLine[],
  translations: Map<string, string | null>,
): TranscriptLine[] {
  return lines.map<TranscriptLine>((l) => ({
    id: l.id,
    idx: l.idx,
    tStartMs: l.tStartMs,
    textOriginal: l.textOriginal,
    textTranslation: translations.get(l.id) ?? null,
    tokens: l.tokens.map<TranscriptToken>((t) => ({
      surface: t.surface,
      reading: t.reading,
      romaji: t.romaji,
      wordEntryId: t.wordEntryId,
      pos: t.pos,
    })),
  }));
}

function toExplainFocal(focal: FocalLine): ExplainFocal {
  return { textOriginal: focal.textOriginal, textTranslation: focal.textTranslation, focusSurface: null };
}

export function Player({ video, lines: linesProp, account, translatedChunks, onFetchChunk, onFetchExplanation, explanationPromptVersion, onBack, onNavigate, className, initialLineId, savedWordIds, onSaveWord, onProgress, wordStatuses, onSaveTokens, onResetTokens, onSearchEntries }: PlayerProps) {
  // Token corrections saved in this session (T3.7) patch the server's lines.
  const [tokenPatches, setTokenPatches] = useState<ReadonlyMap<string, LineTokensUpdate>>(() => new Map());
  const lines = useMemo(
    () => (tokenPatches.size === 0
      ? linesProp
      : linesProp.map((l) => {
          const p = tokenPatches.get(l.id);
          return p ? { ...l, tokens: p.tokens, tokenSpans: p.tokenSpans } : l;
        })),
    [linesProp, tokenPatches],
  );
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [rate, setRate] = useState<PlaybackRate>(1.0);
  const [muted, setMuted] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(() => {
    if (initialLineId) {
      const i = lines.findIndex((l) => l.id === initialLineId);
      if (i >= 0) return i;
    }
    return pickCurrentLine(lines, 0);
  });
  const [userIsScrolling, setUserIsScrolling] = useState(false);
  const [loopLine, setLoopLine] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  // Listening mode, JP toggle, known-word coloring, furigana — per browser.
  // Defaults on the server render; the stored prefs load after mount.
  const [prefs, setPrefs] = useState<PlayerPrefs>(DEFAULT_PLAYER_PREFS);
  const [showRomaji, setShowRomaji] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [activeRailTab, setActiveRailTab] = useState<"transcript" | "explain">("transcript");
  const [explanations, setExplanations] = useState<Map<string, Explanation>>(() => new Map());
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Map<string, string | null>>(
    () => new Map(lines.map((l) => [l.id, l.textTranslation])),
  );
  const doneChunksRef = useRef<Set<number>>(new Set(translatedChunks ?? []));
  const inFlightChunksRef = useRef<Set<number>>(new Set());
  // Background-pump circuit breaker: consecutive failures, and whether the pump
  // is suspended for the session (re-armed when a focal fetch succeeds again).
  const pumpFailuresRef = useRef(0);
  const [translationsSuspended, setTranslationsSuspended] = useState(false);
  const pendingExplainRef = useRef<Map<string, Promise<Explanation>>>(new Map());
  // Lines whose explanation failed. Not retried automatically (that would spin
  // the prefetch pump); a manual regenerate clears the mark. Resets on reload.
  const failedExplainRef = useRef<Set<string>>(new Set());
  // Set when the server says explanations are blocked for every line (daily
  // budget spent, no key): stop asking until a manual regenerate (T2.4).
  const explainBlockedRef = useRef<UserFacingError | null>(null);
  const prefetchRunningRef = useRef(false);
  const explanationsRef = useRef(explanations);
  explanationsRef.current = explanations;

  const handleRef = useRef<PlayerVideoHandle | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const tokenIdxRefs = useRef<Map<number, HTMLElement>>(new Map());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const previousLineIdxRef = useRef<number>(currentLineIdx);
  const appliedInitialRef = useRef(false);
  const savedSetRef = useRef<Set<string>>(new Set(savedWordIds ?? []));
  const currentLineIdxRef = useRef<number>(currentLineIdx);
  currentLineIdxRef.current = currentLineIdx;
  const loopLineRef = useRef(loopLine);
  loopLineRef.current = loopLine;
  const translationsRef = useRef(translations);
  translationsRef.current = translations;
  const listeningModeRef = useRef(prefs.listeningMode);
  listeningModeRef.current = prefs.listeningMode;

  useEffect(() => {
    setPrefs(loadPlayerPrefs(browserStorage()));
  }, []);
  const updatePrefs = useCallback((patch: (p: PlayerPrefs) => Partial<PlayerPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch(prev) };
      savePlayerPrefs(browserStorage(), next);
      return next;
    });
  }, []);

  // ---- Primed listening (lib/listening.ts state machine) ----
  // The machine decides; this runs its effects against the iframe. One phase
  // timer at a time: any state change cancels the pending one.
  const [primed, setPrimed] = useState<PrimedState>(PRIMED_IDLE);
  const primedRef = useRef<PrimedState>(PRIMED_IDLE);
  const primedTimerRef = useRef<number | null>(null);
  const dispatchPrimedRef = useRef<(e: PrimedEvent) => void>(() => {});
  const dispatchPrimed = useCallback(
    (event: PrimedEvent) => {
      const prev = primedRef.current;
      const { state, effects } = primedStep(prev, event, {
        lines: toPrimedLines(lines, translationsRef.current),
        loop: loopLineRef.current,
      });
      if (state === prev) return;
      primedRef.current = state;
      setPrimed(state);
      if (primedTimerRef.current != null) {
        window.clearTimeout(primedTimerRef.current);
        primedTimerRef.current = null;
      }
      const h = handleRef.current;
      for (const e of effects) {
        if (e.type === "pause") h?.pause();
        else if (e.type === "play") h?.play();
        else if (e.type === "seek") {
          h?.seekTo(e.ms / 1000);
          setCurrentMs(e.ms);
        } else {
          primedTimerRef.current = window.setTimeout(() => {
            primedTimerRef.current = null;
            dispatchPrimedRef.current({ type: "timer" });
          }, e.ms);
        }
      }
      // The machine owns the focal line while it runs.
      if (state.phase !== "idle" && state.lineIdx >= 0 && state.lineIdx !== currentLineIdxRef.current) {
        previousLineIdxRef.current = state.lineIdx;
        setCurrentLineIdx(state.lineIdx);
      }
    },
    [lines],
  );
  dispatchPrimedRef.current = dispatchPrimed;
  useEffect(() => () => {
    if (primedTimerRef.current != null) window.clearTimeout(primedTimerRef.current);
  }, []);

  /** Line to start a primed cycle on: under (or next after) the playhead. */
  const primedStartLine = useCallback((): number => {
    const t = handleRef.current?.getCurrentTime();
    if (t == null || Number.isNaN(t)) return Math.max(0, currentLineIdxRef.current);
    return lineAtOrAfter(lines, t * 1000);
  }, [lines]);
  const primedStartLineRef = useRef(primedStartLine);
  primedStartLineRef.current = primedStartLine;

  // ---- Dict popup state ----
  // The focal-line token whose popup is open; its entry (if any) is derived.
  const [openTok, setOpenTok] = useState<{ lineId: string; idx: number } | null>(null);
  const openLine = openTok ? lines.find((l) => l.id === openTok.lineId) : undefined;
  const openWordId = openTok ? (openLine?.tokens[openTok.idx]?.wordEntryId ?? null) : null;
  const openCorrected = Boolean(openTok && openLine?.tokenSpans?.[openTok.idx]?.corrected);
  const [fixing, setFixing] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [dictPopup, setDictPopup] = useState<DictPopupState | null>(null);
  const [dictEntry, setDictEntry] = useState<DictApiEntry | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [savedWord, setSavedWord] = useState(false);

  // ---- Mining state ----
  const [minedCard, setMinedCard] = useState<{ cardId: string; lineId: string; created: boolean } | null>(null);
  const [miningEntry, setMiningEntry] = useState<{
    text: string; translation: string | null;
    target: { surface: string; reading: string | null };
  } | null>(null);
  const [isMining, setIsMining] = useState(false);
  // "Rewatch now" (T3.6, lib/rewatch.ts): the poll loop advances the plan.
  const rewatchRef = useRef<RewatchPlan | null>(null);
  const [rewatching, setRewatching] = useState(false);
  const applyRewatchEffects = useCallback((effects: RewatchEffect[]) => {
    const h = handleRef.current;
    for (const e of effects) {
      if (e.type === "seek") {
        h?.seekTo(e.ms / 1000);
        setCurrentMs(e.ms);
      } else h?.play();
    }
  }, []);
  const cancelRewatch = useCallback(() => {
    if (!rewatchRef.current) return;
    rewatchRef.current = null;
    setRewatching(false);
  }, []);

  // ---- Study-activity accumulators (flushed via onProgress) ----
  const pendingMsRef = useRef(0);
  const pendingLinesRef = useRef<Set<string>>(new Set());
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (!isReady || !isPlaying) return;
    const id = window.setInterval(() => {
      const handle = handleRef.current;
      if (!handle) return;
      const t = handle.getCurrentTime();
      if (Number.isNaN(t)) return;
      const ms = t * 1000;
      setCurrentMs(ms);
      pendingMsRef.current += POLL_MS;
      const newIdx = pickCurrentLine(lines, ms);
      if (newIdx >= 0 && newIdx < lines.length) {
        pendingLinesRef.current.add((lines[newIdx] as PlayerSubtitleLine).id);
      }
      // Rewatch running: it owns seeking (loop-line waits), lines still follow.
      if (rewatchRef.current) {
        const step = rewatchTick(rewatchRef.current, ms);
        rewatchRef.current = step.plan;
        applyRewatchEffects(step.effects);
        if (!step.plan) setRewatching(false);
        if (newIdx !== previousLineIdxRef.current) {
          previousLineIdxRef.current = newIdx;
          setCurrentLineIdx(newIdx);
        }
        return;
      }
      // Primed cycle running: it owns line changes (and loop-line).
      if (primedRef.current.phase !== "idle") {
        dispatchPrimed({ type: "tick", ms });
        return;
      }
      if (newIdx !== previousLineIdxRef.current) {
        const prev = previousLineIdxRef.current;
        if (loopLine && prev >= 0 && prev < lines.length && lineHasAudio(lines[prev] as Parameters<typeof lineHasAudio>[0])) {
          handle.seekTo((lines[prev] as PlayerSubtitleLine).tStartMs / 1000);
          setCurrentMs((lines[prev] as PlayerSubtitleLine).tStartMs);
          setCurrentLineIdx(prev);
          previousLineIdxRef.current = prev;
          return;
        }
        previousLineIdxRef.current = newIdx;
        setCurrentLineIdx(newIdx);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [isReady, isPlaying, loopLine, lines, dispatchPrimed, applyRewatchEffects]);

  // Flush accumulated watch time + seen lines: every PROGRESS_FLUSH_MS, when
  // the tab is hidden, and on unmount. No-op when nothing accumulated.
  useEffect(() => {
    const flush = () => {
      const msWatched = pendingMsRef.current;
      const lineIds = [...pendingLinesRef.current];
      if (msWatched === 0 && lineIds.length === 0) return;
      pendingMsRef.current = 0;
      pendingLinesRef.current.clear();
      onProgressRef.current?.({ msWatched, lineIds });
    };
    const id = window.setInterval(flush, PROGRESS_FLUSH_MS);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  useLayoutEffect(() => {
    if (userIsScrolling) return;
    const rail = railRef.current;
    const target = lineRefs.current.get(currentLineIdx);
    if (!rail || !target) return;
    const railRect = rail.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.top >= railRect.top && targetRect.bottom <= railRect.bottom) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentLineIdx, userIsScrolling]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let timer: number | null = null;
    const arm = () => {
      setUserIsScrolling(true);
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setUserIsScrolling(false), SCROLL_GRACE_MS);
    };
    rail.addEventListener("wheel", arm, { passive: true });
    rail.addEventListener("touchmove", arm, { passive: true });
    return () => {
      rail.removeEventListener("wheel", arm);
      rail.removeEventListener("touchmove", arm);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        seekToLine(Math.max(0, currentLineIdxRef.current - 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        seekToLine(Math.min(lines.length - 1, currentLineIdxRef.current + 1));
      } else if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // One-key mining (T3.6): never pauses or seeks the video.
        e.preventDefault();
        handleMineRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length]);

  // One chunk fetch, shared by the focal effect and the background pump. The
  // done/in-flight refs make the two dedupe against each other. Returns whether
  // the fetch succeeded (true) or failed (false) so the pump can back off; null
  // means "skipped" (already done or in flight). Failures degrade: keep JP only.
  const fetchChunk = useCallback(
    (c: number): Promise<boolean> | null => {
      if (!onFetchChunk || doneChunksRef.current.has(c) || inFlightChunksRef.current.has(c)) return null;
      inFlightChunksRef.current.add(c);
      return onFetchChunk(c)
        .then((rows) => {
          setTranslations((prev) => {
            const next = new Map(prev);
            for (const r of rows) next.set(r.id, r.textTranslation);
            return next;
          });
          doneChunksRef.current.add(c);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          inFlightChunksRef.current.delete(c);
        });
    },
    [onFetchChunk],
  );

  // Lazy translation, focal priority: ensure the current chunk + 1 ahead.
  useEffect(() => {
    if (!onFetchChunk || currentLineIdx < 0) return;
    const cur = lines[currentLineIdx] as PlayerSubtitleLine | undefined;
    if (!cur) return;
    const lastLine = lines[lines.length - 1] as PlayerSubtitleLine | undefined;
    const maxChunk = lastLine ? chunkIndexForLine(lastLine.idx) : 0;
    const base = chunkIndexForLine(cur.idx);
    for (const c of [base, base + 1]) {
      if (c < 0 || c > maxChunk) continue;
      // A focal fetch (user is on this chunk) succeeding means the provider is
      // back — reset failures and re-close the breaker so the pump can resume.
      fetchChunk(c)?.then((ok) => {
        if (!ok) return;
        pumpFailuresRef.current = 0;
        setTranslationsSuspended((s) => (s ? false : s));
      });
    }
  }, [currentLineIdx, lines, onFetchChunk, fetchChunk]);

  // Background pump: translate the whole video starting at the current chunk
  // (then wrapping to the start), one request in flight, so cold seeks never
  // hit an untranslated chunk. Already-done chunks are free (marker cache).
  // Consecutive failures back off (1s → 4s → 15s); after PUMP_BREAKER_THRESHOLD
  // the breaker opens and the pump stops for the session — the focal effect
  // keeps retrying the current chunk on demand and re-closes it on recovery.
  // A dep change or unmount cancels the loop; the refs make a restart cheap.
  useEffect(() => {
    if (!onFetchChunk || lines.length === 0 || translationsSuspended) return;
    let cancelled = false;
    let backoffTimer: number | null = null;
    const lastLine = lines[lines.length - 1] as PlayerSubtitleLine;
    const maxChunk = chunkIndexForLine(lastLine.idx);
    const cur = lines[Math.max(currentLineIdxRef.current, 0)] as PlayerSubtitleLine | undefined;
    const start = cur ? chunkIndexForLine(cur.idx) : 0;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        backoffTimer = window.setTimeout(() => {
          backoffTimer = null;
          resolve();
        }, ms);
      });
    void (async () => {
      for (const c of chunkPumpOrder(start, maxChunk)) {
        if (cancelled) return;
        const ok = await fetchChunk(c);
        if (cancelled) return;
        if (ok === false) {
          const n = (pumpFailuresRef.current += 1);
          if (n >= PUMP_BREAKER_THRESHOLD) {
            setTranslationsSuspended(true);
            return;
          }
          await sleep(PUMP_BACKOFFS_MS[Math.min(n - 1, PUMP_BACKOFFS_MS.length - 1)] ?? 1000);
        } else if (ok === true) {
          pumpFailuresRef.current = 0;
        }
        // ok === null: skipped (already done / focal in flight) — leave the count.
      }
    })();
    return () => {
      cancelled = true;
      if (backoffTimer != null) window.clearTimeout(backoffTimer);
    };
  }, [lines, onFetchChunk, fetchChunk, translationsSuspended]);

  const seekToLine = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= lines.length) return;
      cancelRewatch();
      if (primedRef.current.phase !== "idle") {
        // Restart the primed cycle on the target line (it seeks).
        dispatchPrimed({ type: "seek", lineIdx: idx });
      } else {
        const target = lines[idx] as PlayerSubtitleLine;
        handleRef.current?.seekTo(target.tStartMs / 1000);
        setCurrentMs(target.tStartMs);
        setCurrentLineIdx(idx);
        previousLineIdxRef.current = idx;
      }
      setUserIsScrolling(true);
      window.setTimeout(() => setUserIsScrolling(false), CLICK_GRACE_MS);
    },
    [lines, dispatchPrimed, cancelRewatch],
  );

  // Deep-link from the dictionary: once the iframe is ready, seek to the line.
  useEffect(() => {
    if (!initialLineId || appliedInitialRef.current || !isReady) return;
    const idx = lines.findIndex((l) => l.id === initialLineId);
    if (idx >= 0) {
      appliedInitialRef.current = true;
      seekToLine(idx);
    }
  }, [initialLineId, isReady, lines, seekToLine]);

  const onPlayPause = useCallback(() => {
    const h = handleRef.current;
    if (!h) return;
    // Mid-cycle the video may be held paused by the machine, but to the user
    // it's "playing": the button stops the cycle.
    if (primedRef.current.phase !== "idle") {
      dispatchPrimed({ type: "userPause" });
      return;
    }
    if (isPlaying) h.pause();
    else h.play(); // in primed mode the "playing" event starts the cycle
  }, [isPlaying, dispatchPrimed]);

  // Time-based seek: mid-cycle, restart the cycle on the line there.
  const onSeek = useCallback(
    (ms: number) => {
      const h = handleRef.current;
      if (!h) return;
      cancelRewatch();
      if (primedRef.current.phase !== "idle") {
        const idx = lineAtOrAfter(lines, ms);
        if (idx >= 0) {
          dispatchPrimed({ type: "seek", lineIdx: idx });
          return;
        }
        dispatchPrimed({ type: "userPause" });
      }
      h.seekTo(ms / 1000);
      setCurrentMs(ms);
    },
    [lines, dispatchPrimed, cancelRewatch],
  );

  const onSkip = useCallback(
    (deltaMs: number) => {
      onSeek(Math.max(0, Math.min(durationMs, currentMs + deltaMs)));
    },
    [currentMs, durationMs, onSeek],
  );

  const onCycleRate = useCallback(() => {
    const h = handleRef.current;
    const i = RATES.indexOf(rate);
    const next = RATES[(i + 1) % RATES.length]!;
    setRate(next);
    h?.setPlaybackRate(next);
  }, [rate]);

  // Volume: the IFrame API exposes mute/unMute — toggle it and mirror the state
  // on the button. (A finer-grained slider can layer on setVolume later.)
  const onVolume = useCallback(() => {
    const h = handleRef.current;
    if (!h) return;
    const next = !h.isMuted();
    if (next) h.mute();
    else h.unMute();
    setMuted(next);
  }, []);

  // Fullscreen is a DOM concern, not a YouTube one: toggle the Fullscreen API on
  // the stage container (captions + controls come along since they're its
  // children). Degrades silently where the API is unavailable.
  const onFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    // Both return a promise that rejects when the request is denied (element
    // detached, no user activation); swallow it so it degrades silently rather
    // than surfacing as an unhandled rejection.
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  const onReady = useCallback((h: PlayerVideoHandle) => {
    handleRef.current = h;
    setIsReady(true);
    const d = h.getDuration();
    if (!Number.isNaN(d) && d > 0) setDurationMs(Math.floor(d * 1000));
  }, []);

  const onStateChange = useCallback((s: "playing" | "paused" | "buffering" | "ended" | "unstarted") => {
    setIsPlaying(s === "playing");
    if (listeningModeRef.current !== "primed") return;
    const phase = primedRef.current.phase;
    // Our own play()/pause() echo back here: "playing" only starts a cycle
    // from idle, and "paused" only counts as the user's while listening (the
    // machine pauses for preview/reveal itself). Through refs: PlayerVideo
    // binds this callback once, when the iframe is created.
    // A rewatch's own play() must not start a primed cycle.
    if (s === "playing" && phase === "idle" && !rewatchRef.current) {
      const idx = primedStartLineRef.current();
      if (idx >= 0) dispatchPrimedRef.current({ type: "start", lineIdx: idx });
    } else if ((s === "paused" || s === "ended") && phase === "listen") {
      dispatchPrimedRef.current({ type: "userPause" });
    }
  }, []);

  const onError = useCallback((code: number) => {
    setErrorCode(code);
    // 150/101 = the owner disabled embedded playback; not a transient failure.
    setLoadError(
      code === 150 || code === 101
        ? "This video can't be played inside the app — its owner disabled embedded playback."
        : `Video failed to load (code ${code})`,
    );
  }, []);

  // Single dedup'd primitive: at most one in-flight request per line. A focal
  // click and a background prefetch for the same line share one promise, so a
  // click never re-fires what prefetch already started. Cache-first on a hit.
  const ensureExplanation = useCallback(
    (lineId: string): Promise<Explanation> | undefined => {
      if (!onFetchExplanation) return undefined;
      const cached = explanationsRef.current.get(lineId);
      if (cached) return Promise.resolve(cached);
      // A line that already failed is not retried automatically — re-firing
      // would spin the prefetch pump. Manual regenerate clears the mark.
      if (explainBlockedRef.current) return Promise.reject(explainBlockedRef.current);
      if (failedExplainRef.current.has(lineId)) {
        return Promise.reject(new Error("explanation previously failed"));
      }
      const inFlight = pendingExplainRef.current.get(lineId);
      if (inFlight) return inFlight;
      const p = onFetchExplanation(lineId)
        .then((ex) => {
          // Update the ref synchronously (not just via setState, which lands a
          // render later): the prefetch pump's next loop iteration runs before
          // React commits, and would otherwise re-fetch the line it just
          // finished — present in neither the pending map nor stale ref.
          explanationsRef.current = new Map(explanationsRef.current).set(lineId, ex);
          setExplanations((prev) => new Map(prev).set(lineId, ex));
          return ex;
        })
        .catch((err) => {
          // Latch the failure so the pump and focal effect stop re-firing it.
          failedExplainRef.current.add(lineId);
          if (err instanceof UserFacingError && err.blocking) explainBlockedRef.current = err;
          throw err;
        })
        .finally(() => {
          pendingExplainRef.current.delete(lineId);
        });
      pendingExplainRef.current.set(lineId, p);
      return p;
    },
    [onFetchExplanation],
  );

  // Focal line: drive the panel's loading/error state while latching onto any
  // in-flight prefetch for the same line.
  const fetchFocalExplanation = useCallback(
    async (lineId: string) => {
      const p = ensureExplanation(lineId);
      if (!p) return;
      setExplainLoading(true);
      setExplainError(null);
      try {
        await p;
      } catch (err) {
        setExplainError(
          err instanceof UserFacingError ? err.message : "Could not generate an explanation right now.",
        );
      } finally {
        setExplainLoading(false);
      }
    },
    [ensureExplanation],
  );

  // Regenerate: force a fresh generation, bypassing cache and dedup.
  const regenerateExplanation = useCallback(
    async (lineId: string) => {
      if (!onFetchExplanation) return;
      // Manual retry: clear any prior failure latch so it can be re-attempted.
      failedExplainRef.current.delete(lineId);
      explainBlockedRef.current = null;
      setExplainLoading(true);
      setExplainError(null);
      try {
        const ex = await onFetchExplanation(lineId, { force: true });
        setExplanations((prev) => new Map(prev).set(lineId, ex));
      } catch (err) {
        setExplainError(
          err instanceof UserFacingError ? err.message : "Could not generate an explanation right now.",
        );
      } finally {
        setExplainLoading(false);
      }
    },
    [onFetchExplanation],
  );

  // When the Explain tab is open, ensure the focal line is explained.
  useEffect(() => {
    if (activeRailTab !== "explain" || currentLineIdx < 0) return;
    const line = lines[currentLineIdx] as PlayerSubtitleLine | undefined;
    if (!line || explanations.has(line.id)) return;
    void fetchFocalExplanation(line.id);
  }, [activeRailTab, currentLineIdx, lines, explanations, fetchFocalExplanation]);

  // Prefetch a window of upcoming lines so they're warm before the user
  // clicks. PREFETCH_CONCURRENCY slots run in parallel; ensureExplanation
  // registers the pending promise synchronously, so slots never double-fire
  // a line. Each slot re-reads the live position, so a seek reprioritizes
  // the window. A slot waits at most PREFETCH_WAIT_MS on one line — a stuck
  // generation keeps running in pendingExplainRef (a focal click still
  // latches onto it) but stops blocking the window.
  const pumpPrefetch = useCallback(async () => {
    if (!onFetchExplanation || prefetchRunningRef.current) return;
    prefetchRunningRef.current = true;
    const state = {
      has: (id: string) => explanationsRef.current.has(id),
      pending: (id: string) => pendingExplainRef.current.has(id),
      failed: (id: string) => failedExplainRef.current.has(id),
    };
    const slot = async () => {
      for (;;) {
        const target = pickPrefetchTarget(
          lines,
          currentLineIdxRef.current,
          PREFETCH_AHEAD,
          state,
        );
        if (!target) return;
        const p = ensureExplanation(target.id);
        if (!p) return;
        await Promise.race([
          p.catch(() => undefined), // prefetch failures are non-critical
          new Promise((resolve) => setTimeout(resolve, PREFETCH_WAIT_MS)),
        ]);
      }
    };
    try {
      await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, slot));
    } finally {
      prefetchRunningRef.current = false;
    }
  }, [onFetchExplanation, lines, ensureExplanation]);

  useEffect(() => {
    void pumpPrefetch();
  }, [currentLineIdx, pumpPrefetch]);

  // ---- Dict popup: position + fetch ----
  const openIdx = openTok?.idx ?? null;
  useLayoutEffect(() => {
    if (openIdx == null) {
      setDictPopup(null);
      setDictEntry(null);
      setDictLoading(false);
      setDictError(null);
      setSavedWord(false);
      setFixing(false);
      setFixError(null);
      return;
    }
    // Compute position
    const compute = () => {
      const stage = stageRef.current;
      const tokenEl = tokenIdxRefs.current.get(openIdx);
      if (!stage || !tokenEl) return;
      const s = stage.getBoundingClientRect();
      const r = tokenEl.getBoundingClientRect();
      const popW = 324, pad = 18, gap = 12;
      const center = r.left - s.left + r.width / 2;
      let left = center - popW / 2;
      left = Math.max(pad, Math.min(left, s.width - popW - pad));
      setDictPopup({ wordId: openWordId, surface: "", position: { left, bottom: s.height - (r.top - s.top) + gap, arrowLeft: center - left, w: popW } });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [openIdx, openWordId]);

  // Fetch dict entry when popup opens (a token without an entry shows that,
  // and can still be fixed).
  useEffect(() => {
    if (openIdx == null) return;
    if (!openWordId) {
      setDictEntry(null);
      setDictLoading(false);
      setDictError("No dictionary entry.");
      return;
    }
    setDictLoading(true);
    setDictError(null);
    setDictEntry(null);
    // Fire-and-forget click stat; harmless when the endpoint is absent (Storybook).
    fetch(`/api/dictionary/${encodeURIComponent(openWordId)}/click`, { method: "POST" }).catch(() => {});
    fetch(`/api/dictionary?id=${encodeURIComponent(openWordId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not found" : "fetch failed");
        return r.json();
      })
      .then((data: { entry: DictApiEntry }) => setDictEntry(data.entry))
      .catch((err: Error) => setDictError(err.message === "not found" ? "No dictionary entry." : "Could not load definition."))
      .finally(() => setDictLoading(false));
  }, [openIdx, openWordId]);

  // Reflect the persisted bookmark state when the popup opens; reset on close.
  useEffect(() => {
    setSavedWord(openWordId ? savedSetRef.current.has(openWordId) : false);
  }, [openWordId]);

  const openExplain = useCallback(() => {
    setOpenTok(null);
    setActiveRailTab("explain");
  }, []);

  // Known-word signals: server statuses, plus "seen" for words looked up this
  // session (opening the popup records a click server-side — same rule).
  const [lookedUp, setLookedUp] = useState<ReadonlySet<string>>(() => new Set());
  const effectiveStatuses = useMemo(() => {
    if (lookedUp.size === 0) return wordStatuses;
    const next: Record<string, WordStatus> = { ...(wordStatuses ?? {}) };
    for (const id of lookedUp) if (statusOf(next, id) === "unknown") next[id] = "seen";
    return next;
  }, [wordStatuses, lookedUp]);

  const focalLineId = currentLineIdx >= 0 ? lines[currentLineIdx]?.id ?? null : null;
  const handleTokenClick = useCallback((idx: number, wordId: string | null) => {
    if (!focalLineId) return;
    if (openTok && openTok.lineId === focalLineId && openTok.idx === idx) { setOpenTok(null); return; }
    setOpenTok({ lineId: focalLineId, idx });
    setFixing(false);
    setFixError(null);
    if (wordId) setLookedUp((prev) => (prev.has(wordId) ? prev : new Set(prev).add(wordId)));
  }, [openTok, focalLineId]);

  // The popup belongs to a token of the focal line: close it when the line moves on.
  useEffect(() => {
    if (openTok && openTok.lineId !== focalLineId) setOpenTok(null);
  }, [openTok, focalLineId]);

  const handleDictFix = useCallback(() => {
    handleRef.current?.pause(); // the editor needs the line to stay put
    setFixError(null);
    setFixing(true);
  }, []);

  const applyTokenUpdate = useCallback((lineId: string, update: LineTokensUpdate) => {
    setTokenPatches((cur) => new Map(cur).set(lineId, update));
    setOpenTok(null);
  }, []);

  const handleFixSave = useCallback(async (override: TokenFixOverride) => {
    if (!openTok || !onSaveTokens) return;
    setFixBusy(true);
    setFixError(null);
    try {
      applyTokenUpdate(openTok.lineId, await onSaveTokens(openTok.lineId, override));
    } catch (err) {
      setFixError(err instanceof UserFacingError ? err.message : "Could not save the correction.");
    } finally {
      setFixBusy(false);
    }
  }, [openTok, onSaveTokens, applyTokenUpdate]);

  const handleFixReset = useCallback(async (span: { startIdx: number; endIdx: number }) => {
    if (!openTok || !onResetTokens) return;
    setFixBusy(true);
    setFixError(null);
    try {
      applyTokenUpdate(openTok.lineId, await onResetTokens(openTok.lineId, span));
    } catch (err) {
      setFixError(err instanceof UserFacingError ? err.message : "Could not reset the correction.");
    } finally {
      setFixBusy(false);
    }
  }, [openTok, onResetTokens, applyTokenUpdate]);

  const handleDictExplain = useCallback(() => {
    setOpenTok(null);
    setActiveRailTab("explain");
  }, []);

  const handleDictSaveWord = useCallback(async () => {
    if (!openWordId || !onSaveWord) return;
    const id = openWordId;
    const next = !savedWord;
    setSavedWord(next);
    if (next) savedSetRef.current.add(id); else savedSetRef.current.delete(id);
    try {
      const confirmed = await onSaveWord(id, next);
      setSavedWord(confirmed);
      if (confirmed) savedSetRef.current.add(id); else savedSetRef.current.delete(id);
    } catch {
      setSavedWord(!next);
      if (next) savedSetRef.current.delete(id); else savedSetRef.current.add(id);
    }
  }, [openWordId, savedWord, onSaveWord]);

  const handleDictClose = useCallback(() => {
    setOpenTok(null);
  }, []);

  const handleTokenRef = useCallback((idx: number, el: HTMLElement | null) => {
    if (el) tokenIdxRefs.current.set(idx, el);
    else tokenIdxRefs.current.delete(idx);
  }, []);

  const handleMine = useCallback(() => {
    const line = currentLineIdx >= 0 ? (lines[currentLineIdx] as PlayerSubtitleLine) : undefined;
    if (!line || isMining) return;
    const targetToken = line.tokens.find((t) => t.wordEntryId != null);
    setMiningEntry({
      text: line.textOriginal,
      translation: translations.get(line.id) ?? null,
      target: {
        surface: targetToken?.surface ?? "",
        reading: targetToken?.reading ?? null,
      },
    });
    setIsMining(true);
    setMinedCard(null);
    fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitleLineId: line.id }),
    })
      .then((r) => r.json())
      .then((data: { card?: { id: string; subtitleLineId: string }; created?: boolean }) => {
        if (data.card) {
          setMinedCard({ cardId: data.card.id, lineId: data.card.subtitleLineId, created: Boolean(data.created) });
        }
      })
      .catch(() => {
        /* degrade silently — no toast on network failure for MVP */
      })
      .finally(() => setIsMining(false));
  }, [currentLineIdx, isMining, lines, translations]);
  const handleMineRef = useRef(handleMine);
  handleMineRef.current = handleMine;

  // "Rewatch ×2": replay the mined line's exact clip twice, then resume.
  const handleMinedRewatch = useCallback(() => {
    const h = handleRef.current;
    if (!h || !minedCard) return;
    const line = (lines as PlayerSubtitleLine[]).find((l) => l.id === minedCard.lineId);
    if (!line) return;
    if (primedRef.current.phase !== "idle") dispatchPrimed({ type: "userPause" });
    const t = h.getCurrentTime();
    const step = startRewatch(
      { startMs: line.tStartMs, endMs: line.tEndMs },
      Number.isNaN(t) ? line.tEndMs : t * 1000,
    );
    if (!step.plan) return;
    rewatchRef.current = step.plan;
    setRewatching(true);
    applyRewatchEffects(step.effects);
  }, [minedCard, lines, dispatchPrimed, applyRewatchEffects]);

  const handleMinedUndo = useCallback(() => {
    // Undo: DELETE the card we just created
    if (!minedCard?.created) { setMinedCard(null); return; }
    fetch(`/api/cards/${minedCard.cardId}`, { method: "DELETE" })
      .catch(() => {})
      .finally(() => setMinedCard(null));
  }, [minedCard]);

  const handleMinedViewDeck = useCallback(() => {
    setMinedCard(null);
    onNavigate?.("review");
  }, [onNavigate]);

  const handleMinedClose = useCallback(() => {
    setMinedCard(null);
  }, []);

  // The user's albums, offered as a destination for the mined line's video.
  const [albums, setAlbums] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/albums")
      .then((r) => (r.ok ? r.json() : { albums: [] }))
      .then((d) => { if (live) setAlbums((d.albums ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const handleMinedAddToAlbum = useCallback((albumId: string) => {
    fetch(`/api/albums/${albumId}/videos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: video.id }),
    }).catch(() => {});
  }, [video.id]);

  const nav = useMemo(
    () => buildAppNav({ activeKey: "home", onNavigate: (key) => onNavigate?.(key) }),
    [onNavigate],
  );

  // Memoized so the 4×/s currentMs tick doesn't re-map the whole video: the
  // transcript changes only when a chunk fetch lands (translations); the focal
  // line only when the current line moves. Both feed React.memo'd children, so
  // a pure time tick re-renders just the control bar, not the 600-line list.
  const currentLine = currentLineIdx >= 0 ? (lines[currentLineIdx] as PlayerSubtitleLine | undefined) : undefined;
  const transcriptLines = useMemo(() => toTranscript(lines, translations), [lines, translations]);
  const focal = useMemo(() => toFocal(currentLine, translations), [currentLine, translations]);

  // Stable toggle callbacks so the memoized PlayerTranscript/control bar aren't
  // invalidated every render by fresh inline arrows.
  const onToggleTranslation = useCallback(() => setShowTranslation((v) => !v), []);
  const onCycleFurigana = useCallback(
    () => updatePrefs((p) => ({ furigana: nextInCycle(FURIGANA_MODES, p.furigana) })),
    [updatePrefs],
  );
  const onToggleColorKnown = useCallback(() => updatePrefs((p) => ({ colorKnown: !p.colorKnown })), [updatePrefs]);
  const onToggleJapanese = useCallback(() => updatePrefs((p) => ({ showJapanese: !p.showJapanese })), [updatePrefs]);
  const onToggleRomaji = useCallback(() => setShowRomaji((v) => !v), []);
  const onToggleLoop = useCallback(() => setLoopLine((v) => !v), []);
  const onCycleListeningMode = useCallback(() => {
    const next = nextInCycle(LISTENING_MODES, listeningModeRef.current);
    listeningModeRef.current = next;
    updatePrefs(() => ({ listeningMode: next }));
    if (next !== "primed") dispatchPrimed({ type: "exit" });
    else if (isPlaying) {
      const idx = primedStartLine();
      if (idx >= 0) dispatchPrimed({ type: "start", lineIdx: idx });
    }
  }, [updatePrefs, dispatchPrimed, isPlaying, primedStartLine]);

  const primedPhase = prefs.listeningMode === "primed" ? primed.phase : "idle";
  const focalVisibility = useMemo(
    () => subtitleVisibility(primedPhase, { japanese: prefs.showJapanese, translation: showTranslation }),
    [primedPhase, prefs.showJapanese, showTranslation],
  );

  if (loadError) {
    const embedBlocked = errorCode === 150 || errorCode === 101;
    const watchUrl = `https://www.youtube.com/watch?v=${video.sourceId}&t=${Math.floor(currentMs / 1000)}s`;
    return (
      <AppShell nav={nav} account={account}>
        <div className="p-error">
          <div className="p-error-mark" aria-hidden="true">淵</div>
          <p className="p-error-msg">{loadError}</p>
          {embedBlocked && (
            <p className="p-error-msg" style={{ opacity: 0.7, fontSize: "0.9em" }}>
              Captions, the dictionary, explanations and mining still work here — only playback and clips don&apos;t.
            </p>
          )}
          <div className="p-error-actions">
            {embedBlocked && (
              <a className="p-error-btn" href={watchUrl} target="_blank" rel="noreferrer">
                Watch on YouTube
              </a>
            )}
            <button type="button" className="p-error-btn" onClick={onBack}>Back to library</button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (lines.length === 0) {
    return (
      <AppShell nav={nav} account={account}>
        <div className="p-error">
          <div className="p-error-mark" aria-hidden="true">淵</div>
          <p className="p-error-msg">This video has no subtitles yet.</p>
          <div className="p-error-actions">
            <button type="button" className="p-error-btn" onClick={onBack}>Back to library</button>
          </div>
        </div>
      </AppShell>
    );
  }

  // Adapt WordEntry (API shape) to DictPopup entry shape
  const dictPopupEntry = dictEntry ? {
    word: dictEntry.lemma,
    reading: dictEntry.reading,
    pos: dictEntry.pos,
    frequencyRank: freqTier(dictEntry.frequencyRank),
    definitions: dictEntry.definitions,
    lemma: dictEntry.reading ? { word: dictEntry.lemma, reading: dictEntry.reading } : null,
    pitch: dictEntry.pitch ?? null,
  } : null;

  return (
    <AppShell nav={nav} account={account}>
      <div className={cn("player-page", className)}>
        <PlayerTopBar
          title={video.title}
          channel={video.channel}
          onBack={onBack}
          onClickCaptionSettings={() => undefined}
          onClickSavedWords={() => undefined}
          onClickSettings={() => undefined}
        />
        <div className="player-body">
            <PlayerStage
            stageRef={stageRef}
            videoId={video.sourceId}
            focalLine={focal}
            showTranslation={showTranslation}
            focalVisibility={focalVisibility}
            primedPhase={primedPhase}
            wordStatuses={effectiveStatuses}
            colorKnown={prefs.colorKnown}
            showFurigana={prefs.furigana !== "off"}
            showRomaji={showRomaji}
            activeWordId={openWordId}
            activeTokenIdx={openIdx}
            onDictFix={onSaveTokens ? handleDictFix : undefined}
            dictCorrected={openCorrected}
            dictFixEditor={fixing && openTok && openLine ? (
              <TokenFixEditor
                key={`${openTok.lineId}:${openTok.idx}`}
                tokens={openLine.tokens}
                spans={openLine.tokenSpans}
                index={openTok.idx}
                onSave={handleFixSave}
                onReset={handleFixReset}
                onSearch={onSearchEntries}
                onCancel={() => setFixing(false)}
                error={fixError}
                busy={fixBusy}
              />
            ) : undefined}
            dictPopup={dictPopup}
            dictEntry={dictPopupEntry}
            dictLoading={dictLoading}
            dictError={dictError}
            dictSaved={savedWord}
            minedCard={minedCard}
            miningEntry={miningEntry}
            miningVideo={video}
            miningTime={currentLine ? fmt(currentLine.tStartMs / 1000) : "0:00"}
            onReady={onReady}
            onStateChange={onStateChange}
            onError={onError}
            onTokenClick={handleTokenClick}
            onTokenRef={handleTokenRef}
            onDictExplain={handleDictExplain}
            onDictSaveWord={handleDictSaveWord}
            onDictClose={handleDictClose}
            onExplain={openExplain}
            onMine={handleMine}
            isMining={isMining}
            onMinedUndo={handleMinedUndo}
            onMinedViewDeck={handleMinedViewDeck}
            onMinedClose={handleMinedClose}
            minedAlbums={albums}
            onMinedAddToAlbum={handleMinedAddToAlbum}
            onMinedRewatch={handleMinedRewatch}
            minedRewatching={rewatching}
            controlBar={{
              // Mid-cycle the machine holds the video paused between phases.
              isPlaying: isPlaying || primedPhase === "preview" || primedPhase === "reveal",
              currentMs,
              durationMs,
              playbackRate: rate,
              loopLine,
              disabled: !isReady,
              onPlayPause,
              onSkip,
              onSeek,
              onToggleLoop,
              onToggleTranslation,
              translationsUnavailable: translationsSuspended,
              onToggleRomaji,
              listeningMode: prefs.listeningMode,
              onCycleListeningMode,
              showJapanese: prefs.showJapanese,
              onToggleJapanese,
              onCycleRate,
              onVolume,
              muted,
              onFullscreen,
              formatTimecode: fmt,
            }}
          />
          <aside className="rail" aria-label="Study panel">
            <div className="rail-tabs">
              <button
                type="button"
                className={cn("rail-tab", activeRailTab === "transcript" && "on")}
                aria-current={activeRailTab === "transcript" ? "page" : undefined}
                onClick={() => setActiveRailTab("transcript")}
              >
                <ListIcon /> Transcript
              </button>
              <button
                type="button"
                className={cn("rail-tab", activeRailTab === "explain" && "on")}
                aria-current={activeRailTab === "explain" ? "page" : undefined}
                onClick={() => setActiveRailTab("explain")}
              >
                <SparkIcon /> Explain
              </button>
            </div>
            <div className={cn("rail-content", activeRailTab !== "transcript" && "rail-hidden")}>
              <PlayerTranscript
                lines={transcriptLines}
                currentLineIdx={currentLineIdx}
                showTranslation={showTranslation}
                furigana={prefs.furigana}
                wordStatuses={effectiveStatuses}
                colorKnown={prefs.colorKnown}
                hideCurrentJapanese={!focalVisibility.japanese}
                hideCurrentTranslation={!focalVisibility.translation}
                translationsUnavailable={translationsSuspended}
                onLineClick={seekToLine}
                onToggleTranslation={onToggleTranslation}
                onCycleFurigana={onCycleFurigana}
                onToggleColorKnown={onToggleColorKnown}
                formatTimecode={fmt}
                railRef={railRef}
                lineRefs={lineRefs}
              />
            </div>
            <div className={cn("rail-content", activeRailTab !== "explain" && "rail-hidden")}>
              <PlayerExplain
                focal={focal ? toExplainFocal(focal) : null}
                explanation={currentLine ? explanations.get(currentLine.id) ?? null : null}
                loading={explainLoading}
                error={explainError}
                onRegenerate={() => currentLine && void regenerateExplanation(currentLine.id)}
                promptVersion={explanationPromptVersion}
              />
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
