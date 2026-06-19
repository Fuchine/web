"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { PlayerVideo, type PlayerVideoHandle, type PlayerVideoProps } from "./PlayerVideo";
import { PlayerFocalSubtitles, type FocalLine } from "./PlayerFocalSubtitles";
import { PlayerControlBar, type PlayerControlBarProps } from "./PlayerControlBar";
import { DictPopup } from "../DictPopup/DictPopup";
import { MinedCard } from "../MinedCard/MinedCard";

export type DictPopupState = {
  wordId: string;
  surface: string;
  position: { left: number; bottom: number; arrowLeft: number; w: number };
};

export interface PlayerStageProps {
  videoId: string;
  startAt?: number;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  focalLine: FocalLine | null;
  showTranslation: boolean;
  showFurigana: boolean;
  activeWordId: string | null;
  dictPopup: DictPopupState | null;
  dictEntry: {
    word: string;
    reading: string | null;
    pos: string | null;
    frequencyRank: number | null;
    definitions: { glosses: string[]; partsOfSpeech: string[]; tags?: string[] }[];
    lemma?: { word: string; reading: string } | null;
  } | null;
  dictLoading: boolean;
  dictError: string | null;
  dictSaved: boolean;
  minedCard: { cardId: string; lineId: string; created: boolean } | null;
  miningEntry: { text: string; translation: string | null; target: { surface: string; reading: string | null } } | null;
  miningVideo: { title: string; channel: string | null } | null;
  miningTime: string;
  onReady: PlayerVideoProps["onReady"];
  onStateChange: PlayerVideoProps["onStateChange"];
  onError: PlayerVideoProps["onError"];
  controlBar: Omit<PlayerControlBarProps, "showTranslation" | "className">;
  onWordClick?: (wordId: string, surface: string) => void;
  onWordRef?: (wordId: string, el: HTMLElement | null) => void;
  onDictExplain?: () => void;
  onDictSaveWord?: () => void;
  onDictClose?: () => void;
  onExplain?: () => void;
  onMine?: () => void;
  isMining?: boolean;
  onMinedUndo?: () => void;
  onMinedViewDeck?: () => void;
  onMinedClose?: () => void;
  className?: string;
}

export function PlayerStage({
  videoId,
  startAt,
  stageRef,
  focalLine,
  showTranslation,
  showFurigana,
  activeWordId,
  dictPopup,
  dictEntry,
  dictLoading,
  dictError,
  dictSaved,
  minedCard,
  miningEntry,
  miningVideo,
  miningTime,
  onReady,
  onStateChange,
  onError,
  controlBar,
  onWordClick,
  onWordRef,
  onDictExplain,
  onDictSaveWord,
  onDictClose,
  onExplain,
  onMine,
  isMining = false,
  onMinedUndo,
  onMinedViewDeck,
  onMinedClose,
  className,
}: PlayerStageProps): ReactNode {
  return (
    <div className={cn("stage", className)} ref={stageRef}>
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
          activeWordId={activeWordId}
          onWordClick={onWordClick}
          onWordRef={onWordRef}
          onExplain={onExplain}
          onMine={onMine}
          isMining={isMining}
        />
      ) : (
        <div className="focal-subs-empty" aria-hidden="true" />
      )}
      <PlayerControlBar {...controlBar} showTranslation={showTranslation} />

      {dictPopup && (
        <DictPopup
          position={dictPopup.position}
          entry={dictEntry}
          loading={dictLoading}
          error={dictError}
          saved={dictSaved}
          onExplain={onDictExplain ?? (() => {})}
          onSaveWord={onDictSaveWord ?? (() => {})}
          onClose={onDictClose ?? (() => {})}
        />
      )}

      {minedCard && miningEntry && (
        <MinedCard
          created={minedCard.created}
          sentence={{ text: miningEntry.text, translation: miningEntry.translation }}
          target={miningEntry.target}
          video={miningVideo ?? { title: "", channel: null }}
          time={miningTime}
          onUndo={onMinedUndo ?? (() => {})}
          onViewDeck={onMinedViewDeck ?? (() => {})}
          onClose={onMinedClose ?? (() => {})}
        />
      )}
    </div>
  );
}

export type { PlayerVideoHandle };
