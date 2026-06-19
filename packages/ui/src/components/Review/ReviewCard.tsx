"use client";

import { cn } from "../../lib/cn";
import { ReviewSource } from "./ReviewSource";

export interface TargetWord {
  surface: string;
  reading: string;
  lemma: string;
  meanings: string[];
}

export interface ReviewCardProps {
  sentence: { text: string; translation: string | null };
  target: TargetWord | null;
  revealed: boolean;
  clip: { sourceId: string; startMs: number; endMs: number };
  source: { channel: string; videoTitle: string; thumbnailUrl: string };
  onPlayClip: () => void;
}

function splitSentence(text: string, target: TargetWord): {
  before: string;
  blank: string;
  after: string;
} {
  const idx = text.indexOf(target.surface);
  if (idx === -1) return { before: text, blank: "", after: "" };
  return {
    before: text.slice(0, idx),
    blank: target.surface,
    after: text.slice(idx + target.surface.length),
  };
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ReviewCard({
  sentence,
  target,
  revealed,
  source,
  onPlayClip,
}: ReviewCardProps) {
  const { before, blank, after } = target
    ? splitSentence(sentence.text, target)
    : { before: "", blank: "", after: sentence.text };

  return (
    <div className={cn("card", "rise")}>
      <div className="card-kicker">
        {revealed ? (
          <>
            <CheckIcon />
            Recall checked
          </>
        ) : (
          <>Recall the missing word</>
        )}
      </div>

      <div className="card-sentence jp">
        {before}
        {target ? (
          revealed ? (
            <ruby className="target">
              {target.surface}
              <rt>{target.reading}</rt>
            </ruby>
          ) : (
            <span className="blank">［ ＿＿ ］</span>
          )
        ) : (
          sentence.text
        )}
        {after}
      </div>

      <div className="card-en">{sentence.translation}</div>

      <button className="card-audio" onClick={onPlayClip} type="button">
        <VolumeIcon />
        Replay audio
      </button>

      {revealed && target && (
        <div className="card-reveal">
          <div className="cr-grid">
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
          </div>
          <ReviewSource
            channel={source.channel}
            title={source.videoTitle}
            thumbnailUrl={source.thumbnailUrl}
            onPlayClip={onPlayClip}
          />
        </div>
      )}
    </div>
  );
}
