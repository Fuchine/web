"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ReviewTopBar } from "./ReviewTopBar";
import { ReviewCard, type TargetWord } from "./ReviewCard";
import { ReviewDock } from "./ReviewDock";
import { ReviewEmbed, type ReviewEmbedHandle } from "./ReviewEmbed";
import { ReviewModePicker } from "./ReviewModePicker";
import { ListenRevealCard } from "./ListenRevealCard";
import { ClozeCard } from "./ClozeCard";
import { ShadowCard } from "./ShadowCard";
import { useWakeLock } from "../Pwa/usePwa";
import { checkClozeAnswer, pickClozeTarget } from "./answer";
import {
  canGrade,
  initialStep,
  primaryLabel,
  readStoredReviewMode,
  reviewStepReducer,
  storeReviewMode,
  type ReviewMode,
  type ReviewStep,
  type ReviewStepAction,
} from "./review-modes";

interface WordEntryData {
  reading: string;
  lemma: string;
  definitions: { glosses: string[] }[];
  pos: string;
  /** JMdict frequency band (lower = more common); used to pick the cloze word. */
  frequencyRank?: number | null;
}

export interface ReviewItem {
  cardId: string;
  videoId: string;
  cardType: string;
  notes: string | null;
  due: Date;
  state: number; // 0=New 1=Learning 2=Review 3=Relearning
  clip: { source: string; sourceId: string; startMs: number; endMs: number };
  sentence: { text: string; translation: string | null };
  intervals: Record<string, Date>;
  tokens: { surface: string; lemma: string; reading: string | null; pos: string; wordEntryId: string | null }[];
  wordEntriesMap: Record<string, WordEntryData>;
}

export interface ReviewSessionProps {
  queue: ReviewItem[];
  onComplete: () => void;
  /**
   * Start in this mode instead of the one remembered in this browser
   * (localStorage). Stories use it; the app leaves it unset.
   */
  initialMode?: ReviewMode;
  /** Extra controls at the end of the top bar (the app puts the install button there). */
  topBarActions?: ReactNode;
}

interface GradeOption {
  grade: 1 | 2 | 3 | 4;
  label: string;
  when: string;
}

const MAX_TARGET_LEN = 4;

function isReasonableTarget(surface: string): boolean {
  return surface.length >= 1 && surface.length <= MAX_TARGET_LEN;
}

function extractTarget(sentenceText: string, tokens: ReviewItem["tokens"], wordEntriesMap: ReviewItem["wordEntriesMap"]): TargetWord | null {
  const PATTERNS: RegExp[] = [
    /ている$/,
    /ていた$/,
    /でしょう$/,
    /ません$/,
    /らしい$/,
    /ようだ$/,
    /みたい$/,
    /たろう$/,
    /だろう$/,
    /して$/,
    /いて$/,
    /んで$/,
    /った$/,
    /れた$/,
    /ない$/,
    /ます$/,
    /そう$/,
    /って$/,
    /た$/,
  ];

  for (const p of PATTERNS) {
    const m = sentenceText.match(p);
    if (m) {
      const surface = m[0];
      if (!isReasonableTarget(surface)) continue;
      const token = tokens.find((t) => t.surface === surface);
      if (token?.wordEntryId) {
        const entry = wordEntriesMap[token.wordEntryId];
        if (entry) return { surface, reading: entry.reading, lemma: entry.lemma, meanings: entry.definitions.flatMap((d) => d.glosses) };
      }
      return { surface, reading: "", lemma: surface, meanings: [] };
    }
  }

  if (tokens.length > 0) {
    const tokensWithEntry = [...tokens].reverse().find((t) => t.wordEntryId && wordEntriesMap[t.wordEntryId]);
    if (tokensWithEntry) {
      const entry = wordEntriesMap[tokensWithEntry.wordEntryId!];
      if (entry) {
        return {
          surface: tokensWithEntry.surface,
          reading: entry.reading,
          lemma: entry.lemma,
          meanings: entry.definitions.flatMap((d) => d.glosses),
        };
      }
    }
  }

  const km = sentenceText.match(/[\u4e00-\u9faf]{2}$/);
  if (km && isReasonableTarget(km[0])) return { surface: km[0], reading: "", lemma: km[0], meanings: [] };

  if (tokens.length > 0) {
    const words = sentenceText.split(/[\s　]+/).filter(Boolean);
    const last = words[words.length - 1];
    if (last && isReasonableTarget(last)) return { surface: last, reading: "", lemma: last, meanings: [] };
  }

  return null;
}

function formatInterval(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "<1 min";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d`;
}

function computeGrades(intervals: Record<string, Date>): GradeOption[] {
  return [
    { grade: 1 as const, label: "Again", when: formatInterval(intervals["1"]!) },
    { grade: 2 as const, label: "Hard", when: formatInterval(intervals["2"]!) },
    { grade: 3 as const, label: "Good", when: formatInterval(intervals["3"]!) },
    { grade: 4 as const, label: "Easy", when: formatInterval(intervals["4"]!) },
  ];
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

interface ReviewSummaryProps {
  cardsReviewed: number;
  onDone: () => void;
}

function ReviewSummary({ cardsReviewed, onDone }: ReviewSummaryProps) {
  return (
    <div className="rev-summary">
      <div className="summary-icon">
        <CheckIcon />
      </div>
      <h2 className="summary-title">Session complete!</h2>
      <p className="summary-sub">
        {cardsReviewed} card{cardsReviewed !== 1 ? "s" : ""} reviewed
      </p>
      <button className="summary-btn" onClick={onDone} type="button">
        Back to library
      </button>
    </div>
  );
}

export function ReviewSession({ queue, onComplete, initialMode, topBarActions }: ReviewSessionProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionDone, setSessionDone] = useState(0);
  const [embedPlaying, setEmbedPlaying] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ReviewMode>(initialMode ?? "classic");
  const embedRef = useRef<ReviewEmbedHandle | null>(null);

  // The remembered mode is read after mount (localStorage is browser-only).
  useEffect(() => {
    if (initialMode === undefined) setMode(readStoredReviewMode());
  }, [initialMode]);

  function changeMode(next: ReviewMode) {
    setMode(next);
    storeReviewMode(next);
  }

  const card = queue[currentIdx];
  const targetWord = useMemo<TargetWord | null>(
    () => (card ? extractTarget(card.sentence.text, card.tokens, card.wordEntriesMap) : null),
    [card],
  );
  const clozeTarget = useMemo(
    () => (card ? pickClozeTarget(card.sentence.text, card.tokens, card.wordEntriesMap) : null),
    [card],
  );
  // A line with nothing worth blanking falls back to the classic card.
  const effectiveMode: ReviewMode = mode === "cloze" && !clozeTarget ? "classic" : mode;

  // The per-card step resets whenever the card or the mode changes.
  const stepKey = `${currentIdx}:${effectiveMode}`;
  const [stepState, setStepState] = useState<{ key: string; step: ReviewStep }>({
    key: stepKey,
    step: initialStep(effectiveMode),
  });
  const step = stepState.key === stepKey ? stepState.step : initialStep(effectiveMode);
  function dispatch(action: ReviewStepAction) {
    setStepState({ key: stepKey, step: reviewStepReducer(step, action) });
  }

  // Keep a phone's screen on for the whole session (T3.13); released on exit.
  useWakeLock(!sessionComplete && queue.length > 0);

  // New card: stop any clip; "listen first" starts it straight away.
  useEffect(() => {
    setEmbedPlaying(effectiveMode === "listen");
  }, [currentIdx, effectiveMode]);

  // Early returns AFTER hooks
  if (queue.length === 0) {
    onComplete();
    return null;
  }

  if (sessionComplete) {
    return (
      <div className="rev-main">
        <ReviewTopBar
          current={queue.length}
          total={queue.length}
          againCount={0}
          learnCount={0}
          dueCount={0}
          onExit={onComplete}
        />
        <div className="rev-stage">
          <ReviewSummary cardsReviewed={sessionDone} onDone={onComplete} />
        </div>
      </div>
    );
  }

  const currentCard = card!;
  const remaining = queue.slice(currentIdx);

  const againCount = remaining.filter((c) => c.state === 3).length;
  const learnCount = remaining.filter((c) => c.state === 1).length;
  const dueCount = remaining.length;

  async function handleGrade(grade: 1 | 2 | 3 | 4) {
    const card = queue[currentIdx];
    if (!card) return;

    setSessionDone((d) => d + 1);
    if (currentIdx < queue.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      setSessionComplete(true);
    }

    try {
      await fetch(`/api/review/${card.cardId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
    } catch {
      // silently fail — card already advanced in UI
    }
  }

  async function handleEditNotes(notes: string) {
    const card = queue[currentIdx];
    if (!card) return;
    try {
      const res = await fetch(`/api/cards/${card.cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        setLocalNotes((prev) => ({ ...prev, [card.cardId]: notes }));
      }
    } catch {
      // silently fail
    }
  }

  function playClip() {
    if (embedPlaying) embedRef.current?.play();
    else setEmbedPlaying(true);
  }

  const source = {
    channel: "YouTube",
    videoTitle: currentCard.clip.sourceId,
    thumbnailUrl: `https://img.youtube.com/vi/${currentCard.clip.sourceId}/mqdefault.jpg`,
  };
  const clip = {
    sourceId: currentCard.clip.sourceId,
    startMs: currentCard.clip.startMs,
    endMs: currentCard.clip.endMs,
  };
  const notes = localNotes[currentCard.cardId] ?? currentCard.notes;
  const gradable = canGrade(step);

  let body: ReactNode;
  if (step.mode === "shadow") {
    body = (
      <ShadowCard
        key={currentCard.cardId}
        clip={clip}
        sentence={currentCard.sentence}
        target={targetWord}
        source={source}
        notes={notes}
        onEditNotes={handleEditNotes}
      />
    );
  } else if (step.mode === "listen") {
    body = (
      <ListenRevealCard
        key={currentCard.cardId}
        step={step.step}
        sentence={currentCard.sentence}
        target={targetWord}
        source={source}
        notes={notes}
        onPlayClip={playClip}
        onEditNotes={handleEditNotes}
      />
    );
  } else if (step.mode === "cloze" && clozeTarget) {
    body = (
      <ClozeCard
        key={currentCard.cardId}
        sentence={currentCard.sentence}
        target={clozeTarget}
        result={step.step === "checked" ? { answer: step.answer, correct: step.correct } : null}
        source={source}
        notes={notes}
        onSubmit={(answer) => dispatch({ type: "submit", answer, correct: checkClozeAnswer(answer, clozeTarget) })}
        onPlayClip={playClip}
        onEditNotes={handleEditNotes}
      />
    );
  } else {
    body = (
      <ReviewCard
        key={currentCard.cardId}
        sentence={currentCard.sentence}
        target={targetWord}
        revealed={gradable}
        clip={clip}
        source={source}
        notes={notes}
        onPlayClip={playClip}
        onEditNotes={handleEditNotes}
      />
    );
  }

  return (
    <div className="rev-main">
      <ReviewTopBar
        current={currentIdx + 1}
        total={queue.length}
        againCount={againCount}
        learnCount={learnCount}
        dueCount={dueCount}
        onExit={onComplete}
        actions={topBarActions}
      />

      <ReviewModePicker mode={mode} onChange={changeMode} />
      {mode === "cloze" && effectiveMode !== "cloze" && (
        <p className="rev-mode-fallback">No word to blank on this card — showing the classic card.</p>
      )}

      <div className="rev-stage">
        <div className="rev-stack">
          {embedPlaying && step.mode !== "shadow" && (
            <ReviewEmbed
              key={currentCard.cardId}
              ref={embedRef}
              videoId={clip.sourceId}
              startMs={clip.startMs}
              endMs={clip.endMs}
              onEnded={() => setEmbedPlaying(false)}
            />
          )}
          {body}
        </div>
      </div>

      <ReviewDock
        revealed={gradable}
        grades={computeGrades(currentCard.intervals)}
        primaryLabel={primaryLabel(step) ?? undefined}
        spaceShortcut={step.mode !== "cloze"}
        onShowAnswer={() => dispatch(step.mode === "cloze" ? { type: "giveUp" } : { type: "reveal" })}
        onGrade={handleGrade}
      />
    </div>
  );
}
