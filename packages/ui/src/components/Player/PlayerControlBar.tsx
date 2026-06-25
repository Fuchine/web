"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
export type PlaybackRate = (typeof RATES)[number];

export interface PlayerControlBarProps {
  isPlaying: boolean;
  currentMs: number;
  durationMs: number;
  playbackRate: PlaybackRate;
  loopLine: boolean;
  showTranslation: boolean;
  showRomaji: boolean;
  /** Disabled when no IFrame is ready. */
  disabled?: boolean;
  onPlayPause: () => void;
  onSkip: (deltaMs: number) => void;
  onSeek: (ms: number) => void;
  onToggleLoop: () => void;
  onToggleTranslation: () => void;
  onToggleRomaji: () => void;
  onCycleRate: () => void;
  onVolume?: () => void;
  onFullscreen?: () => void;
  formatTimecode: (ms: number) => string;
  className?: string;
}

const Icon = {
  rewind: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 5L4 12l7 7M20 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  forward: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 5l7 7-7 7M4 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  loop: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 3l4 4-4 4M21 7H8a4 4 0 0 0-4 4M7 21l-4-4 4-4M3 17h13a4 4 0 0 0 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  cc: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 11.5a1.5 1.5 0 1 1 1.5 1.5M14 11.5a1.5 1.5 0 1 1 1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  volume: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4h3l5 4V6L7 10H4zM16 8.5a4 4 0 0 1 0 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  fullscreen: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function btnCx(active: boolean, isPlay: boolean): string {
  return cn(
    "c-btn",
    isPlay && "c-play",
    active && "on",
  );
}

export function PlayerControlBar({
  isPlaying,
  currentMs,
  durationMs,
  playbackRate,
  loopLine,
  showTranslation,
  showRomaji,
  disabled,
  onPlayPause,
  onSkip,
  onSeek,
  onToggleLoop,
  onToggleTranslation,
  onToggleRomaji,
  onCycleRate,
  onVolume,
  onFullscreen,
  formatTimecode,
  className,
}: PlayerControlBarProps): ReactNode {
  const pct = durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0;

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.floor(ratio * durationMs));
  };

  return (
    <div className={cn("controls", className)} role="toolbar" aria-label="Playback controls">
      <div className="c-cluster">
        <button
          type="button"
          className={btnCx(false, false)}
          onClick={() => onSkip(-5000)}
          disabled={disabled}
          aria-label="Back 5 seconds"
          title="Back 5s"
        >
          {Icon.rewind}
        </button>
        <button
          type="button"
          className={btnCx(false, true)}
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? Icon.pause : Icon.play}
        </button>
        <button
          type="button"
          className={btnCx(false, false)}
          onClick={() => onSkip(5000)}
          disabled={disabled}
          aria-label="Forward 5 seconds"
          title="Forward 5s"
        >
          {Icon.forward}
        </button>
      </div>

      <span className="c-time">
        <b>{formatTimecode(currentMs)}</b> / {formatTimecode(durationMs)}
      </span>

      <div
        className="scrub"
        onClick={onScrub}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, durationMs)}
        aria-valuenow={Math.max(0, currentMs)}
        tabIndex={0}
      >
        <div className="scrub-fill" style={{ width: `${pct}%` }} />
        <div className="scrub-knob" style={{ left: `${pct}%` }} />
      </div>

      <div className="c-cluster">
        <button
          type="button"
          className={btnCx(loopLine, false)}
          onClick={onToggleLoop}
          disabled={disabled}
          aria-label="Loop current line"
          aria-pressed={loopLine}
          title="Loop line"
        >
          {Icon.loop}
        </button>
        <button
          type="button"
          className={btnCx(showTranslation, false)}
          onClick={onToggleTranslation}
          disabled={disabled}
          aria-label="Toggle translation"
          aria-pressed={showTranslation}
          title="Translation"
        >
          {Icon.cc}
        </button>
        <button
          type="button"
          className={btnCx(showRomaji, false)}
          onClick={onToggleRomaji}
          disabled={disabled}
          aria-label="Toggle romaji"
          aria-pressed={showRomaji}
          title="Romaji"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20">
            <text x="5" y="17" fontSize="14" fontWeight="600" fill="currentColor" fontFamily="sans-serif">Aa</text>
          </svg>
        </button>
        <button
          type="button"
          className="c-speed"
          onClick={onCycleRate}
          disabled={disabled}
          aria-label="Playback speed"
          title="Playback speed"
        >
          {playbackRate.toFixed(1)}×
        </button>
        {onVolume && (
          <button
            type="button"
            className="c-btn"
            onClick={onVolume}
            disabled={disabled}
            aria-label="Volume"
            title="Volume"
          >
            {Icon.volume}
          </button>
        )}
        {onFullscreen && (
          <button
            type="button"
            className="c-btn"
            onClick={onFullscreen}
            disabled={disabled}
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            {Icon.fullscreen}
          </button>
        )}
      </div>
    </div>
  );
}
