"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { PlayerVideo, type PlayerVideoHandle, type PlayerVideoProps } from "./PlayerVideo";
import { PlayerFocalSubtitles, type FocalLine } from "./PlayerFocalSubtitles";
import { PlayerControlBar, type PlayerControlBarProps } from "./PlayerControlBar";

export interface PlayerStageProps {
  videoId: string;
  startAt?: number;
  focalLine: FocalLine | null;
  showTranslation: boolean;
  showFurigana: boolean;
  onReady: PlayerVideoProps["onReady"];
  onStateChange: PlayerVideoProps["onStateChange"];
  onError: PlayerVideoProps["onError"];
  controlBar: Omit<PlayerControlBarProps, "showTranslation" | "className">;
  className?: string;
}

export function PlayerStage({
  videoId,
  startAt,
  focalLine,
  showTranslation,
  showFurigana,
  onReady,
  onStateChange,
  onError,
  controlBar,
  className,
}: PlayerStageProps): ReactNode {
  return (
    <div className={cn("stage", className)}>
      <PlayerVideo
        videoId={videoId}
        startAt={startAt}
        onReady={onReady}
        onStateChange={onStateChange}
        onError={onError}
      />
      {focalLine ? (
        <PlayerFocalSubtitles
          line={focalLine}
          showTranslation={showTranslation}
          showFurigana={showFurigana}
        />
      ) : (
        <div className="focal-subs-empty" aria-hidden="true" />
      )}
      <PlayerControlBar {...controlBar} showTranslation={showTranslation} />
    </div>
  );
}

export type { PlayerVideoHandle };
