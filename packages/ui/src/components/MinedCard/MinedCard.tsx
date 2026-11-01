"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../../lib/cn";

export type MinedAlbum = { id: string; name: string };

export type MinedCardProps = {
  created: boolean;
  sentence: { text: string; translation: string | null };
  target: { surface: string; reading: string | null };
  video: { title: string; channel: string | null };
  time: string;
  onUndo: () => void;
  onViewDeck: () => void;
  onClose: () => void;
  /** The user's albums, offered as a destination for this line's video. */
  albums?: MinedAlbum[];
  /** Add the current video to an album (idempotent). */
  onAddToAlbum?: (albumId: string) => void;
  /** "Rewatch ×2": replay the mined clip right away (T3.6). */
  onRewatch?: () => void;
  /** A rewatch is playing — the action shows progress and the toast stays up. */
  rewatching?: boolean;
  /**
   * Dismiss on its own after this many ms so mining never needs a click to get
   * back to the video. Held while hovered/focused or rewatching. 0 = never.
   */
  autoDismissMs?: number;
  className?: string;
};

/** Default lifetime of the mined toast (T3.6: mining never stops the video). */
export const MINED_TOAST_MS = 8000;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="17" height="17">
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="13" height="13">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14">
      <rect
        x="2.5"
        y="5.5"
        width="19"
        height="13"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10 9.2v5.6l5-2.8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14">
      <path
        d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function renderCloze(text: string, surface: string): ReactNode {
  const idx = text.indexOf(surface);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="cloze">［ ＿＿ ］</span>
      {text.slice(idx + surface.length)}
    </>
  );
}

export function MinedCard({
  created,
  sentence,
  target,
  video,
  time,
  onUndo,
  onViewDeck,
  onClose,
  albums,
  onAddToAlbum,
  onRewatch,
  rewatching = false,
  autoDismissMs = MINED_TOAST_MS,
  className,
}: MinedCardProps) {
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [held, setHeld] = useState(false);
  // Auto-dismiss: restarts whenever the hold is released (hover/focus leaves,
  // rewatch ends), so the toast never vanishes under the pointer.
  useEffect(() => {
    if (!autoDismissMs || held || rewatching) return;
    const t = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(t);
  }, [autoDismissMs, held, rewatching, onClose]);
  const handleAdd = (id: string) => {
    setAdded((s) => new Set(s).add(id));
    onAddToAlbum?.(id);
  };
  return (
    <div className={cn("mined-wrap", className)} role="status" aria-live="polite">
      <div
        className="mined"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
        }}
      >
        <div className="mined-top">
          <span className="mined-check">
            <CheckIcon />
          </span>
          <div className="mined-titles">
            <div className="mined-title">
              {created ? "Mined to Review" : "Already mined"}
            </div>
            <div className="mined-sub">
              {created ? "1 new card · curate it later in Phrases" : "Card already exists in your deck"}
            </div>
          </div>
          <button
            type="button"
            className="mined-x"
            onClick={onClose}
            title="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mined-card">
          <span className="mined-card-tag">Front</span>
          <div className="mined-cloze jp">
            {renderCloze(sentence.text, target.surface)}
          </div>
          {sentence.translation && (
            <div className="mined-card-en">{sentence.translation}</div>
          )}
          <div className="mined-card-foot">
            <span className="mined-target jp">
              {target.surface}
              {target.reading && <span className="r">{target.reading}</span>}
            </span>
            <span className="mined-from">
              <YoutubeIcon /> {video.title ?? video.channel ?? "Video"} · {time}
            </span>
          </div>
        </div>

        {albums && albums.length > 0 && onAddToAlbum && (
          <div className="mined-albums">
            <span className="mined-albums-label">Add video to album</span>
            <div className="mined-chips">
              {albums.map((a) => {
                const on = added.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={cn("mined-chip", on && "on")}
                    disabled={on}
                    onClick={() => handleAdd(a.id)}
                    title={on ? `Added to ${a.name}` : `Add to ${a.name}`}
                  >
                    {on ? <CheckIcon /> : <PlusIcon />} {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mined-actions">
          <button type="button" className="mined-btn" onClick={onUndo}>
            Undo
          </button>
          {onRewatch && (
            <button
              type="button"
              className={cn("mined-btn", rewatching && "on")}
              onClick={onRewatch}
              disabled={rewatching}
              aria-busy={rewatching}
              title="Replay this line twice, then keep watching"
            >
              <ReplayIcon /> {rewatching ? "Rewatching…" : "Rewatch ×2"}
            </button>
          )}
          <button
            type="button"
            className="mined-btn primary"
            onClick={onViewDeck}
          >
            View deck <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
