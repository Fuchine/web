"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { PlayerVideo, type PlayerVideoHandle, type PlayerVideoProps } from "./PlayerVideo";
import { PlayerFocalSubtitles, type FocalLine } from "./PlayerFocalSubtitles";
import { PlayerControlBar, type PlayerControlBarProps } from "./PlayerControlBar";
import { DictPopup, type DictPopupProps } from "../DictPopup/DictPopup";
import type { PrimedPhase, WordStatus } from "../../lib/listening";
import { MinedCard } from "../MinedCard/MinedCard";

export type DictPopupState = {
  /** The entry shown; null for a token without one (it can still be fixed). */
  wordId: string | null;
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
  showRomaji: boolean;
  /**
   * What the focal line actually shows right now (user toggles combined with
   * the primed-listening phase). Default: the toggles as given.
   */
  focalVisibility?: { japanese: boolean; translation: boolean };
  primedPhase?: PrimedPhase;
  wordStatuses?: Readonly<Record<string, WordStatus>>;
  colorKnown?: boolean;
  activeWordId: string | null;
  dictPopup: DictPopupState | null;
  dictEntry: DictPopupProps["entry"];
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
  controlBar: Omit<PlayerControlBarProps, "showTranslation" | "showRomaji" | "className">;
  onWordClick?: (wordId: string, surface: string) => void;
  onWordRef?: (wordId: string, el: HTMLElement | null) => void;
  /** Index-addressed token clicks (T3.7); see PlayerFocalSubtitles. */
  onTokenClick?: (index: number, wordId: string | null, surface: string) => void;
  onTokenRef?: (index: number, el: HTMLElement | null) => void;
  activeTokenIdx?: number | null;
  /** Token correction (T3.7): "Fix" action, "Corrected by you", editor body. */
  onDictFix?: () => void;
  dictCorrected?: boolean;
  dictFixEditor?: ReactNode;
  /** "Mark as unknown" (T3.9). */
  onDictMarkUnknown?: () => void;
  dictMarkedUnknown?: boolean;
  onDictExplain?: () => void;
  onDictSaveWord?: () => void;
  onDictClose?: () => void;
  onExplain?: () => void;
  onMine?: () => void;
  isMining?: boolean;
  onMinedUndo?: () => void;
  onMinedViewDeck?: () => void;
  onMinedClose?: () => void;
  minedAlbums?: { id: string; name: string }[];
  onMinedAddToAlbum?: (albumId: string) => void;
  /** "Rewatch ×2" on the mined toast (T3.6). */
  onMinedRewatch?: () => void;
  minedRewatching?: boolean;
  className?: string;
}

export function PlayerStage({
  videoId,
  startAt,
  stageRef,
  focalLine,
  showTranslation,
  showFurigana,
  showRomaji,
  focalVisibility,
  primedPhase,
  wordStatuses,
  colorKnown,
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
  onTokenClick,
  onTokenRef,
  activeTokenIdx,
  onDictFix,
  dictCorrected,
  dictFixEditor,
  onDictMarkUnknown,
  dictMarkedUnknown,
  onDictExplain,
  onDictSaveWord,
  onDictClose,
  onExplain,
  onMine,
  isMining = false,
  onMinedUndo,
  onMinedViewDeck,
  onMinedClose,
  minedAlbums,
  onMinedAddToAlbum,
  onMinedRewatch,
  minedRewatching = false,
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
          showTranslation={focalVisibility ? focalVisibility.translation : showTranslation}
          showJapanese={focalVisibility ? focalVisibility.japanese : true}
          primedPhase={primedPhase}
          wordStatuses={wordStatuses}
          colorKnown={colorKnown}
          showFurigana={showFurigana}
          showRomaji={showRomaji}
          activeWordId={activeWordId}
          onWordClick={onWordClick}
          onWordRef={onWordRef}
          onTokenClick={onTokenClick}
          onTokenRef={onTokenRef}
          activeTokenIdx={activeTokenIdx}
          onExplain={onExplain}
          onMine={onMine}
          isMining={isMining}
        />
      ) : (
        <div className="focal-subs-empty" aria-hidden="true" />
      )}
      <PlayerControlBar {...controlBar} showTranslation={showTranslation} showRomaji={showRomaji} />

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
          onFix={onDictFix}
          onMarkUnknown={onDictMarkUnknown}
          markedUnknown={dictMarkedUnknown}
          corrected={dictCorrected}
          fixEditor={dictFixEditor}
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
          albums={minedAlbums}
          onAddToAlbum={onMinedAddToAlbum}
          onRewatch={onMinedRewatch}
          rewatching={minedRewatching}
        />
      )}
    </div>
  );
}

export type { PlayerVideoHandle };
