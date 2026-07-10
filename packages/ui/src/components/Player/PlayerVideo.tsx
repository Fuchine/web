/// <reference path="./youtube.d.ts" />
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

export interface PlayerVideoHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

export interface PlayerVideoProps {
  videoId: string;
  /** Optional initial start offset (seconds). */
  startAt?: number;
  /** Called when the IFrame API is ready. */
  onReady?: (handle: PlayerVideoHandle) => void;
  /** Called when play/pause state changes. */
  onStateChange?: (state: "playing" | "paused" | "buffering" | "ended" | "unstarted") => void;
  /** Called when a load error happens. */
  onError?: (code: number) => void;
  className?: string;
}

export function PlayerVideo({
  videoId,
  startAt,
  onReady,
  onStateChange,
  onError,
  className,
}: PlayerVideoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const player = new window.YT!.Player(containerRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          start: startAt ? Math.floor(startAt) : undefined,
          // Without an origin matching the embedding page, YouTube refuses
          // playback with error 150/153 in local/embedded contexts.
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setIsReady(true);
            const handle: PlayerVideoHandle = {
              play: () => player.playVideo(),
              pause: () => player.pauseVideo(),
              seekTo: (s) => player.seekTo(s, true),
              setPlaybackRate: (r) => player.setPlaybackRate(r as YT.playbackRate),
              getCurrentTime: () => player.getCurrentTime(),
              getDuration: () => player.getDuration(),
              mute: () => player.mute(),
              unMute: () => player.unMute(),
              isMuted: () => player.isMuted(),
              destroy: () => player.destroy(),
            };
            onReady?.(handle);
          },
          onStateChange: (e) => {
            const map: Record<number, "playing" | "paused" | "buffering" | "ended" | "unstarted"> = {
              [-1]: "unstarted",
              0: "ended",
              1: "playing",
              2: "paused",
              3: "buffering",
              5: "paused",
            };
            onStateChange?.(map[e.data] ?? "unstarted");
          },
          onError: (e) => onError?.(e.data),
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // videoId and startAt are stable; we intentionally do not re-create the
    // player when the parent re-renders. If the parent needs a new video,
    // it should remount this component (key={videoId}).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className={cn("player-video", className)}>
      <div ref={containerRef} className="player-video-iframe" />
      <div className="player-video-fallback" aria-hidden="true" />
    </div>
  );
}
