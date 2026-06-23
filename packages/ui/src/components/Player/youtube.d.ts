// Minimal YouTube IFrame Player API types (only the surface we use in T1.3).
// Source: https://developers.google.com/youtube/iframe_api_reference

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }

  // Loaded by the IFrame API script. The callback runs once the global is ready.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace YT {
    type PlayerState = -1 | 0 | 1 | 2 | 3 | 5; // UNSTARTED, ENDED, PLAYING, PAUSED, BUFFERING, CUED
    type playbackRate = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;

    interface PlayerOptions {
      videoId?: string;
      width?: number | string;
      height?: number | string;
      playerVars?: {
        autoplay?: 0 | 1;
        controls?: 0 | 1;
        modestbranding?: 0 | 1;
        playsinline?: 0 | 1;
        rel?: 0 | 1;
        start?: number;
        end?: number;
        origin?: string;
      };
      events?: {
        onReady?: (event: PlayerEvent) => void;
        onStateChange?: (event: PlayerStateChangeEvent) => void;
        onError?: (event: PlayerErrorEvent) => void;
      };
    }

    interface PlayerEvent {
      target: Player;
    }

    interface PlayerStateChangeEvent {
      target: Player;
      data: PlayerState;
    }

    interface PlayerErrorEvent {
      target: Player;
      data: number; // 2, 5, 100, 101, 150
    }

    interface Player {
      playVideo(): void;
      pauseVideo(): void;
      stopVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): PlayerState;
      setPlaybackRate(rate: playbackRate): void;
      getPlaybackRate(): number;
      getAvailablePlaybackRates(): playbackRate[];
      setVolume(volume: number): void;
      getVolume(): number;
      destroy(): void;
    }

    const Player: new (element: HTMLElement | string, options: PlayerOptions) => Player;
  }
}

export {};
