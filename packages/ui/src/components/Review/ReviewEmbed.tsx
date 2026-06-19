"use client";

import { useEffect, useRef } from "react";
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

export interface ReviewEmbedProps {
  videoId: string;
  startMs: number;
  endMs: number;
  onEnded?: () => void;
}

export function ReviewEmbed({ videoId, startMs, endMs, onEnded }: ReviewEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;

      const elementId = `yt-review-player-${videoId}-${startMs}`;
      const player = new window.YT!.Player(elementId, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            player.seekTo(startMs / 1000, true);
            player.playVideo();

            intervalRef.current = setInterval(() => {
              if (cancelled) return;
              const currentTime = player.getCurrentTime();
              if (currentTime >= endMs / 1000) {
                player.pauseVideo();
                if (intervalRef.current) clearInterval(intervalRef.current);
                onEnded?.();
              }
            }, 100);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [videoId, startMs, endMs, onEnded]);

  const elementId = `yt-review-player-${videoId}-${startMs}`;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--radius)]",
        "bg-black"
      )}
      style={{ aspectRatio: "16 / 9" }}
    >
      <div ref={containerRef} id={elementId} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
