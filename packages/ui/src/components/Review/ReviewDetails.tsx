"use client";

import { useState } from "react";
import { ReviewSource } from "./ReviewSource";
import type { TargetWord } from "./ReviewCard";

export interface ReviewDetailsProps {
  /** Word details; omitted rows when the line has no target word. */
  target: TargetWord | null;
  source: { channel: string; videoTitle: string; thumbnailUrl: string };
  notes: string | null;
  onPlayClip: () => void;
  onEditNotes?: (notes: string) => void;
}

/** The revealed back of a card: word details, notes and the clip's source. Shared by every review mode. */
export function ReviewDetails({ target, source, notes, onPlayClip, onEditNotes }: ReviewDetailsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");

  function handleSave() {
    onEditNotes?.(draft);
    setEditing(false);
  }

  return (
    <div className="card-reveal">
      <div className="cr-grid">
        {target && (
          <>
            <div className="cr-row">
              <span className="cr-k">Reading</span>
              <span className="cr-v jp">{target.reading}</span>
            </div>
            <div className="cr-row">
              <span className="cr-k">Dictionary form</span>
              <span className="cr-v jp">
                {target.lemma}
                <span className="cr-r">{target.reading}</span>
              </span>
            </div>
            <div className="cr-row">
              <span className="cr-k">Meaning</span>
              <span className="cr-v">{target.meanings.join("; ")}</span>
            </div>
          </>
        )}
        <div className="cr-row">
          <span className="cr-k">Notes</span>
          <span className="cr-v">
            {editing ? (
              <span className="cr-edit">
                <textarea
                  className="cr-notes-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                />
                <button
                  className="cr-save-btn"
                  onClick={handleSave}
                  type="button"
                >
                  Save
                </button>
              </span>
            ) : (
              <span className="cr-notes">
                {notes || <span className="cr-no-notes">Add notes…</span>}
                {onEditNotes && (
                  <button
                    className="cr-edit-btn"
                    onClick={() => { setDraft(notes ?? ""); setEditing(true); }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
              </span>
            )}
          </span>
        </div>
      </div>
      <ReviewSource
        channel={source.channel}
        title={source.videoTitle}
        thumbnailUrl={source.thumbnailUrl}
        onPlayClip={onPlayClip}
      />
    </div>
  );
}
