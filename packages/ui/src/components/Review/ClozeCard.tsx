"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import { splitSentence } from "./cloze";
import { ReviewDetails } from "./ReviewDetails";
import { acceptedAnswers, type ClozeTarget } from "./answer";
import { CheckIcon, CrossIcon, ReplayIcon } from "./icons";

export interface ClozeCardProps {
  sentence: { text: string; translation: string | null };
  target: ClozeTarget;
  /** null while typing; the comparison outcome once checked. */
  result: { answer: string; correct: boolean } | null;
  source: { channel: string; videoTitle: string; thumbnailUrl: string };
  notes: string | null;
  onSubmit: (answer: string) => void;
  onPlayClip: () => void;
  onEditNotes?: (notes: string) => void;
}

/**
 * Cloze (T3.11): one target word blanked, the learner types it. The check is
 * feedback only — the learner still grades the card; nothing is auto-graded.
 */
export function ClozeCard({ sentence, target, result, source, notes, onSubmit, onPlayClip, onEditNotes }: ClozeCardProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const parts = splitSentence(sentence.text, target);
  const checked = result !== null;

  // Focus the answer field with a mouse/trackpad only. On a phone, popping the
  // keyboard on every new card would cover the sentence before it is read and
  // shift the page (T3.13); the learner taps the field when ready.
  useEffect(() => {
    if (checked) return;
    try {
      if (window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
    } catch {
      // no matchMedia: leave focus alone
    }
  }, [checked]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Enter confirms an IME conversion first; only a plain Enter submits.
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    onSubmit(value);
  }

  return (
    <div className={cn("card", "rise")}>
      <div className="card-kicker">{checked ? "Checked — now grade yourself" : "Type the missing word"}</div>

      <div className="card-sentence jp">
        {parts.map((part, i) =>
          part.isTarget ? (
            checked ? (
              <ruby key={i} className="target">
                {part.text}
                <rt>{target.reading}</rt>
              </ruby>
            ) : (
              <span key={i} className="blank">［ ＿＿ ］</span>
            )
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </div>

      {sentence.translation && <div className="card-en">{sentence.translation}</div>}

      {!checked ? (
        <div className="cloze-form">
          <input
            className="cloze-input jp"
            type="text"
            lang="ja"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Kanji or kana"
            aria-label="Missing word"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            ref={inputRef}
          />
          <button className="cloze-check" type="button" onClick={() => onSubmit(value)} disabled={value.trim() === ""}>
            Check
          </button>
        </div>
      ) : (
        <div className={cn("cloze-result", result.correct ? "ok" : "bad")} role="status">
          <span className="cloze-result-head">
            {result.correct ? <CheckIcon /> : <CrossIcon />}
            {result.correct ? "Correct" : result.answer ? "Not quite" : "Answer"}
          </span>
          {!result.correct && result.answer && (
            <span className="cloze-result-line">
              You typed <b className="jp">{result.answer}</b>
            </span>
          )}
          <span className="cloze-result-line">
            Accepted: <span className="jp">{acceptedAnswers(target).join(" · ")}</span>
          </span>
        </div>
      )}

      <button className="card-audio" onClick={onPlayClip} type="button">
        <ReplayIcon />
        Replay clip
      </button>

      {checked && (
        <ReviewDetails
          target={{ surface: target.surface, reading: target.reading, lemma: target.lemma, meanings: target.meanings }}
          source={source}
          notes={notes}
          onPlayClip={onPlayClip}
          onEditNotes={onEditNotes}
        />
      )}
    </div>
  );
}
