"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
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

/** Imperative controls for the clip (replay from the start, pause). */
export interface ReviewEmbedHandle {
  play: () => void;
  pause: () => void;
}

export interface ReviewEmbedProps {
  videoId: string;
  startMs: number;
  endMs: number;
  /** Fires each time the clip reaches its end (not while looping). */
  onEnded?: () => void;
  /** Restart from `startMs` on reaching `endMs` instead of stopping. */
  loop?: boolean;
  /** Start playing as soon as the player is ready (default true). */
  autoplay?: boolean;
  ref?: Ref<ReviewEmbedHandle>;
}

export function ReviewEmbed({ videoId, startMs, endMs, onEnded, loop = false, autoplay = true, ref }: ReviewEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const playingRef = useRef(false);
  const pendingPlayRef = useRef(autoplay);
  // Callbacks/flags via refs: a new onEnded or loop value must not recreate the player.
  const onEndedRef = useRef(onEnded);
  const loopRef = useRef(loop);
  onEndedRef.current = onEnded;
  loopRef.current = loop;

  useImperativeHandle(ref, () => ({
    play: () => {
      const p = playerRef.current;
      if (!p || !readyRef.current) {
        pendingPlayRef.current = true;
        return;
      }
      p.seekTo(startMs / 1000, true);
      p.playVideo();
      playingRef.current = true;
    },
    pause: () => {
      playingRef.current = false;
      pendingPlayRef.current = false;
      if (readyRef.current) playerRef.current?.pauseVideo();
    },
  }), [startMs]);

  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      // The API replaces its target node with an iframe, so give it a node we
      // create (inside a wrapper with no React children) rather than one React owns.
      const host = document.createElement("div");
      host.style.width = "100%";
      host.style.height = "100%";
      wrapper.appendChild(host);

      const player = new window.YT!.Player(host, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: pendingPlayRef.current ? 1 : 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            readyRef.current = true;
            player.seekTo(startMs / 1000, true);
            if (pendingPlayRef.current) {
              player.playVideo();
              playingRef.current = true;
            } else {
              player.pauseVideo();
            }
            pendingPlayRef.current = false;

            interval = setInterval(() => {
              if (cancelled || !playingRef.current) return;
              if (player.getCurrentTime() >= endMs / 1000) {
                if (loopRef.current) {
                  player.seekTo(startMs / 1000, true);
                } else {
                  player.pauseVideo();
                  playingRef.current = false;
                  onEndedRef.current?.();
                }
              }
            }, 100);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      readyRef.current = false;
      playingRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        // iframe already gone
      }
      playerRef.current = null;
      wrapper.replaceChildren();
    };
  }, [videoId, startMs, endMs]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--radius)]",
        "bg-black"
      )}
      style={{ aspectRatio: "16 / 9" }}
    >
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
