"use client";

import { cn } from "../../lib/cn";
import { splitSentence } from "./cloze";
import { ReviewDetails } from "./ReviewDetails";
import type { TargetWord } from "./ReviewCard";
import { HeadphonesIcon, ReplayIcon } from "./icons";

export interface ListenRevealCardProps {
  /** listen: audio only · text: + Japanese · answer: + translation and details. */
  step: "listen" | "text" | "answer";
  sentence: { text: string; translation: string | null };
  target: TargetWord | null;
  source: { channel: string; videoTitle: string; thumbnailUrl: string };
  notes: string | null;
  onPlayClip: () => void;
  onEditNotes?: (notes: string) => void;
}

const KICKER: Record<ListenRevealCardProps["step"], string> = {
  listen: "Listen — what did they say?",
  text: "Read it — what does it mean?",
  answer: "Check the meaning",
};

/** "Listen → reveal": the clip first, then the Japanese, then the translation (T3.11). */
export function ListenRevealCard({ step, sentence, target, source, notes, onPlayClip, onEditNotes }: ListenRevealCardProps) {
  const parts = target ? splitSentence(sentence.text, target) : null;

  return (
    <div className={cn("card", "rise")}>
      <div className="card-kicker">{KICKER[step]}</div>

      {step === "listen" ? (
        <div className="card-listen">
          <HeadphonesIcon />
          <p>Listen to the clip. Replay it as often as you like.</p>
        </div>
      ) : (
        <div className="card-sentence jp">
          {step === "answer" && target && parts
            ? parts.map((part, i) =>
                part.isTarget ? (
                  <ruby key={i} className="target">
                    {part.text}
                    <rt>{target.reading}</rt>
                  </ruby>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )
            : sentence.text}
        </div>
      )}

      {step === "answer" && (
        <div className="card-en">
          {sentence.translation ?? <span className="card-en-missing">No translation for this line yet.</span>}
        </div>
      )}

      <button className="card-audio" onClick={onPlayClip} type="button">
        <ReplayIcon />
        Replay clip
      </button>

      {step === "answer" && (
        <ReviewDetails target={target} source={source} notes={notes} onPlayClip={onPlayClip} onEditNotes={onEditNotes} />
      )}
    </div>
  );
}
