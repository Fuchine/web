"use client";

import { cn } from "../../lib/cn";
import { ReviewDetails } from "./ReviewDetails";
import { splitSentence } from "./cloze";

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
  notes: string | null;
  onPlayClip: () => void;
  onEditNotes?: (notes: string) => void;
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
  notes,
  onPlayClip,
  onEditNotes,
}: ReviewCardProps) {
  const parts = target ? splitSentence(sentence.text, target) : null;

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
        {target && parts
          ? parts.map((part, i) =>
              part.isTarget ? (
                revealed ? (
                  <ruby key={i} className="target">
                    {target.surface}
                    <rt>{target.reading}</rt>
                  </ruby>
                ) : (
                  <span key={i} className="blank">［ ＿＿ ］</span>
                )
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )
          : sentence.text}
      </div>

      <div className="card-en">{sentence.translation}</div>

      <button className="card-audio" onClick={onPlayClip} type="button">
        <VolumeIcon />
        Replay audio
      </button>

      {revealed && target && (
        <ReviewDetails
          target={target}
          source={source}
          notes={notes}
          onPlayClip={onPlayClip}
          onEditNotes={onEditNotes}
        />
      )}
    </div>
  );
}
