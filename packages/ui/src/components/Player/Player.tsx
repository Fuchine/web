"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { AppShell } from "../AppShell/AppShell";
import { buildAppNav } from "../AppShell/nav";
import { pickCurrentLine, formatTimecode as fmt, lineHasAudio, chunkIndexForLine } from "@fuchine/core";
import { PlayerTopBar } from "./PlayerTopBar";
import { PlayerStage, type PlayerVideoHandle, type DictPopupState } from "./PlayerStage";
import { PlayerTranscript, type TranscriptLine, type TranscriptToken } from "./PlayerTranscript";
import type { FocalLine, FocalToken } from "./PlayerFocalSubtitles";
import { RATES, type PlaybackRate } from "./PlayerControlBar";
import { PlayerExplain, type ExplainFocal } from "./PlayerExplain";
import type { Explanation, WordEntry } from "@fuchine/db";

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
  tokens: { surface: string; lemma: string; reading: string | null; pos: string | null; wordEntryId: string | null }[];
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
  onBack: () => void;
  onNavigate?: (key: string) => void;
  /** Deep-link: focus + seek to this line on load (from the dictionary). */
  initialLineId?: string;
  /** word_entry ids the user has bookmarked (initial state for the popup). */
  savedWordIds?: string[];
  /** Persist a bookmark toggle; resolves to the new saved state. */
  onSaveWord?: (wordEntryId: string, save: boolean) => Promise<boolean>;
  className?: string;
}

const POLL_MS = 250;
const SCROLL_GRACE_MS = 1200;
const CLICK_GRACE_MS = 600;
const PREFETCH_AHEAD = 4;

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
    tokens: l.tokens.map<TranscriptToken>((t) => ({ surface: t.surface, reading: t.reading })),
  }));
}

function toExplainFocal(focal: FocalLine): ExplainFocal {
  return { textOriginal: focal.textOriginal, textTranslation: focal.textTranslation, focusSurface: null };
}

export function Player({ video, lines, account, translatedChunks, onFetchChunk, onFetchExplanation, onBack, onNavigate, className, initialLineId, savedWordIds, onSaveWord }: PlayerProps) {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [rate, setRate] = useState<PlaybackRate>(1.0);
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
  const [showFurigana, setShowFurigana] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeRailTab, setActiveRailTab] = useState<"transcript" | "explain">("transcript");
  const [explanations, setExplanations] = useState<Map<string, Explanation>>(() => new Map());
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Map<string, string | null>>(
    () => new Map(lines.map((l) => [l.id, l.textTranslation])),
  );
  const doneChunksRef = useRef<Set<number>>(new Set(translatedChunks ?? []));
  const inFlightChunksRef = useRef<Set<number>>(new Set());
  const pendingExplainRef = useRef<Map<string, Promise<Explanation>>>(new Map());
  // Lines whose explanation failed. Not retried automatically (that would spin
  // the prefetch pump); a manual regenerate clears the mark. Resets on reload.
  const failedExplainRef = useRef<Set<string>>(new Set());
  const prefetchRunningRef = useRef(false);
  const explanationsRef = useRef(explanations);
  explanationsRef.current = explanations;

  const handleRef = useRef<PlayerVideoHandle | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const tokenWordRefs = useRef<Map<string, HTMLElement>>(new Map());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const previousLineIdxRef = useRef<number>(currentLineIdx);
  const appliedInitialRef = useRef(false);
  const savedSetRef = useRef<Set<string>>(new Set(savedWordIds ?? []));
  const currentLineIdxRef = useRef<number>(currentLineIdx);
  currentLineIdxRef.current = currentLineIdx;

  // ---- Dict popup state ----
  const [openWordId, setOpenWordId] = useState<string | null>(null);
  const [dictPopup, setDictPopup] = useState<DictPopupState | null>(null);
  const [dictEntry, setDictEntry] = useState<WordEntry | null>(null);
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

  useEffect(() => {
    if (!isReady || !isPlaying) return;
    const id = window.setInterval(() => {
      const handle = handleRef.current;
      if (!handle) return;
      const t = handle.getCurrentTime();
      if (Number.isNaN(t)) return;
      const ms = t * 1000;
      setCurrentMs(ms);
      const newIdx = pickCurrentLine(lines, ms);
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
  }, [isReady, isPlaying, loopLine, lines]);

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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length]);

  // Lazy translation: ensure the current chunk + 1 ahead are translated.
  useEffect(() => {
    if (!onFetchChunk || currentLineIdx < 0) return;
    const cur = lines[currentLineIdx] as PlayerSubtitleLine | undefined;
    if (!cur) return;
    const lastLine = lines[lines.length - 1] as PlayerSubtitleLine | undefined;
    const maxChunk = lastLine ? chunkIndexForLine(lastLine.idx) : 0;
    const base = chunkIndexForLine(cur.idx);
    for (const c of [base, base + 1]) {
      if (c < 0 || c > maxChunk || doneChunksRef.current.has(c) || inFlightChunksRef.current.has(c)) continue;
      inFlightChunksRef.current.add(c);
      onFetchChunk(c)
        .then((rows) => {
          setTranslations((prev) => {
            const next = new Map(prev);
            for (const r of rows) next.set(r.id, r.textTranslation);
            return next;
          });
          doneChunksRef.current.add(c);
        })
        .catch(() => {
          /* degrade: keep JP only; a later trigger may retry this chunk */
        })
        .finally(() => {
          inFlightChunksRef.current.delete(c);
        });
    }
  }, [currentLineIdx, lines, onFetchChunk]);

  const seekToLine = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= lines.length) return;
      const target = lines[idx] as PlayerSubtitleLine;
      handleRef.current?.seekTo(target.tStartMs / 1000);
      setCurrentMs(target.tStartMs);
      setCurrentLineIdx(idx);
      previousLineIdxRef.current = idx;
      setUserIsScrolling(true);
      window.setTimeout(() => setUserIsScrolling(false), CLICK_GRACE_MS);
    },
    [lines],
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
    if (isPlaying) h.pause();
    else h.play();
  }, [isPlaying]);

  const onSkip = useCallback(
    (deltaMs: number) => {
      const h = handleRef.current;
      if (!h) return;
      const targetMs = Math.max(0, Math.min(durationMs, currentMs + deltaMs));
      h.seekTo(targetMs / 1000);
      setCurrentMs(targetMs);
    },
    [currentMs, durationMs],
  );

  const onSeek = useCallback((ms: number) => {
    const h = handleRef.current;
    if (!h) return;
    h.seekTo(ms / 1000);
    setCurrentMs(ms);
  }, []);

  const onCycleRate = useCallback(() => {
    const h = handleRef.current;
    const i = RATES.indexOf(rate);
    const next = RATES[(i + 1) % RATES.length]!;
    setRate(next);
    h?.setPlaybackRate(next);
  }, [rate]);

  // Volume and fullscreen: the IFrame API does not expose either method, and
  // the spec for T1.3 keeps the native YouTube controls visible. These
  // buttons are visual affordances only; clicking is a no-op for now.
  const onVolume = useCallback(() => undefined, []);
  const onFullscreen = useCallback(() => undefined, []);

  const onReady = useCallback((h: PlayerVideoHandle) => {
    handleRef.current = h;
    setIsReady(true);
    const d = h.getDuration();
    if (!Number.isNaN(d) && d > 0) setDurationMs(Math.floor(d * 1000));
  }, []);

  const onStateChange = useCallback((s: "playing" | "paused" | "buffering" | "ended" | "unstarted") => {
    setIsPlaying(s === "playing");
  }, []);

  const onError = useCallback((code: number) => {
    setLoadError(`Video failed to load (code ${code})`);
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
      } catch {
        setExplainError("Could not generate an explanation right now.");
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
      setExplainLoading(true);
      setExplainError(null);
      try {
        const ex = await onFetchExplanation(lineId, { force: true });
        setExplanations((prev) => new Map(prev).set(lineId, ex));
      } catch {
        setExplainError("Could not generate an explanation right now.");
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

  // Prefetch a window of upcoming lines so they're warm before the user clicks.
  // Sequential (one at a time): the provider serializes requests per key, so
  // fanning out only queues them. The pump re-reads the live position each step,
  // so a seek reprioritizes the window toward where the user actually is.
  const pumpPrefetch = useCallback(async () => {
    if (!onFetchExplanation || prefetchRunningRef.current) return;
    prefetchRunningRef.current = true;
    try {
      for (;;) {
        const base = currentLineIdxRef.current;
        if (base < 0) break;
        let target: PlayerSubtitleLine | null = null;
        for (let d = 1; d <= PREFETCH_AHEAD; d++) {
          const idx = base + d;
          if (idx >= lines.length) break;
          const line = lines[idx] as PlayerSubtitleLine;
          if (
            explanationsRef.current.has(line.id) ||
            pendingExplainRef.current.has(line.id) ||
            failedExplainRef.current.has(line.id)
          )
            continue;
          target = line;
          break;
        }
        if (!target) break;
        try {
          await ensureExplanation(target.id);
        } catch {
          /* prefetch failures are non-critical */
        }
      }
    } finally {
      prefetchRunningRef.current = false;
    }
  }, [onFetchExplanation, lines, ensureExplanation]);

  useEffect(() => {
    void pumpPrefetch();
  }, [currentLineIdx, pumpPrefetch]);

  // ---- Dict popup: position + fetch ----
  useLayoutEffect(() => {
    if (!openWordId) {
      setDictPopup(null);
      setDictEntry(null);
      setDictLoading(false);
      setDictError(null);
      setSavedWord(false);
      return;
    }
    // Compute position
    const compute = () => {
      const stage = stageRef.current;
      const tokenEl = tokenWordRefs.current.get(openWordId);
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
  }, [openWordId]);

  // Fetch dict entry when popup opens
  useEffect(() => {
    if (!openWordId) return;
    setDictLoading(true);
    setDictError(null);
    setDictEntry(null);
    fetch(`/api/dictionary?id=${encodeURIComponent(openWordId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not found" : "fetch failed");
        return r.json();
      })
      .then((data: { entry: WordEntry }) => setDictEntry(data.entry))
      .catch((err: Error) => setDictError(err.message === "not found" ? "No dictionary entry." : "Could not load definition."))
      .finally(() => setDictLoading(false));
  }, [openWordId]);

  // Reflect the persisted bookmark state when the popup opens; reset on close.
  useEffect(() => {
    setSavedWord(openWordId ? savedSetRef.current.has(openWordId) : false);
  }, [openWordId]);

  const openExplain = useCallback(() => {
    setOpenWordId(null);
    setActiveRailTab("explain");
  }, []);

  const handleWordClick = useCallback((wordId: string, _surface: string) => {
    if (wordId === openWordId) { setOpenWordId(null); return; }
    setOpenWordId(wordId);
  }, [openWordId]);

  const handleDictExplain = useCallback(() => {
    setOpenWordId(null);
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
    setOpenWordId(null);
  }, []);

  const handleWordRef = useCallback((wordId: string, el: HTMLElement | null) => {
    if (el) tokenWordRefs.current.set(wordId, el);
    else tokenWordRefs.current.delete(wordId);
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

  const nav = useMemo(
    () => buildAppNav({ activeKey: "home", onNavigate: (key) => onNavigate?.(key) }),
    [onNavigate],
  );

  if (loadError) {
    return (
      <AppShell nav={nav} account={account}>
        <div className="p-error">
          <div className="p-error-mark" aria-hidden="true">淵</div>
          <p className="p-error-msg">{loadError}</p>
          <div className="p-error-actions">
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

  const transcriptLines = toTranscript(lines, translations);
  const currentLine = currentLineIdx >= 0 ? (lines[currentLineIdx] as PlayerSubtitleLine) : undefined;
  const focal = toFocal(currentLine, translations);

  // Adapt WordEntry (API shape) to DictPopup entry shape
  const dictPopupEntry = dictEntry ? {
    word: dictEntry.lemma,
    reading: dictEntry.reading,
    pos: dictEntry.pos,
    frequencyRank: dictEntry.frequencyRank ? Math.min(5, Math.max(1, Math.ceil(dictEntry.frequencyRank / 6000))) : 0,
    definitions: dictEntry.definitions,
    lemma: dictEntry.reading ? { word: dictEntry.lemma, reading: dictEntry.reading } : null,
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
            showFurigana={showFurigana}
            activeWordId={openWordId}
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
            onWordClick={handleWordClick}
            onWordRef={handleWordRef}
            onDictExplain={handleDictExplain}
            onDictSaveWord={handleDictSaveWord}
            onDictClose={handleDictClose}
            onExplain={openExplain}
            onMine={handleMine}
            isMining={isMining}
            onMinedUndo={handleMinedUndo}
            onMinedViewDeck={handleMinedViewDeck}
            onMinedClose={handleMinedClose}
            controlBar={{
              isPlaying,
              currentMs,
              durationMs,
              playbackRate: rate,
              loopLine,
              disabled: !isReady,
              onPlayPause,
              onSkip,
              onSeek,
              onToggleLoop: () => setLoopLine((v) => !v),
              onToggleTranslation: () => setShowTranslation((v) => !v),
              onCycleRate,
              onVolume,
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
                Transcript
              </button>
              <button
                type="button"
                className={cn("rail-tab", activeRailTab === "explain" && "on")}
                aria-current={activeRailTab === "explain" ? "page" : undefined}
                onClick={() => setActiveRailTab("explain")}
              >
                Explain
              </button>
            </div>
            {activeRailTab === "transcript" ? (
              <PlayerTranscript
                lines={transcriptLines}
                currentLineIdx={currentLineIdx}
                showTranslation={showTranslation}
                showFurigana={showFurigana}
                onLineClick={seekToLine}
                onToggleTranslation={() => setShowTranslation((v) => !v)}
                onToggleFurigana={() => setShowFurigana((v) => !v)}
                formatTimecode={fmt}
                railRef={railRef}
                lineRefs={lineRefs}
              />
            ) : (
              <PlayerExplain
                focal={focal ? toExplainFocal(focal) : null}
                explanation={currentLine ? explanations.get(currentLine.id) ?? null : null}
                loading={explainLoading}
                error={explainError}
                onRegenerate={() => currentLine && void regenerateExplanation(currentLine.id)}
              />
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
