"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { AppShell, type NavItem } from "../AppShell/AppShell";
import { pickCurrentLine, formatTimecode as fmt, lineHasAudio, chunkIndexForLine } from "@fuchine/core";
import { PlayerTopBar } from "./PlayerTopBar";
import { PlayerStage, type PlayerVideoHandle } from "./PlayerStage";
import { PlayerTranscript, type TranscriptLine, type TranscriptToken } from "./PlayerTranscript";
import type { FocalLine, FocalToken } from "./PlayerFocalSubtitles";
import { RATES, type PlaybackRate } from "./PlayerControlBar";

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
  onBack: () => void;
  onNavigate?: (key: string) => void;
  className?: string;
}

const POLL_MS = 250;
const SCROLL_GRACE_MS = 1200;
const CLICK_GRACE_MS = 600;

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

export function Player({ video, lines, account, translatedChunks, onFetchChunk, onBack, onNavigate, className }: PlayerProps) {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [rate, setRate] = useState<PlaybackRate>(1.0);
  const [currentLineIdx, setCurrentLineIdx] = useState(() => pickCurrentLine(lines, 0));
  const [userIsScrolling, setUserIsScrolling] = useState(false);
  const [loopLine, setLoopLine] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showFurigana, setShowFurigana] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Map<string, string | null>>(
    () => new Map(lines.map((l) => [l.id, l.textTranslation])),
  );
  const doneChunksRef = useRef<Set<number>>(new Set(translatedChunks ?? []));
  const inFlightChunksRef = useRef<Set<number>>(new Set());

  const handleRef = useRef<PlayerVideoHandle | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const previousLineIdxRef = useRef<number>(currentLineIdx);
  const currentLineIdxRef = useRef<number>(currentLineIdx);
  currentLineIdxRef.current = currentLineIdx;

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

  const nav: NavItem[] = useMemo(
    () => [
      { key: "library", label: "Library", active: true, onSelect: () => { onNavigate?.("library"); onBack(); } },
      { key: "review", label: "Review", soon: true },
      { key: "settings", label: "Settings", soon: true },
    ],
    [onBack, onNavigate],
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
            videoId={video.sourceId}
            focalLine={focal}
            showTranslation={showTranslation}
            showFurigana={showFurigana}
            onReady={onReady}
            onStateChange={onStateChange}
            onError={onError}
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
        </div>
      </div>
    </AppShell>
  );
}
