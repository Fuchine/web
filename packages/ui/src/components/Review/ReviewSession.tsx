"use client";

import { useEffect, useState, useRef } from "react";
import { ReviewTopBar } from "./ReviewTopBar";
import { ReviewCard, type TargetWord } from "./ReviewCard";
import { ReviewDock } from "./ReviewDock";
import { ReviewEmbed } from "./ReviewEmbed";

interface WordEntryData {
  reading: string;
  lemma: string;
  definitions: { glosses: string[] }[];
  pos: string;
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
}

type SessionState = "idle" | "question" | "answer";

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

export function ReviewSession({ queue, onComplete }: ReviewSessionProps) {
  const [state, setState] = useState<SessionState>("idle");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionDone, setSessionDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [targetWord, setTargetWord] = useState<TargetWord | null>(null);
  const [embedPlaying, setEmbedPlaying] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const startTimeRef = useRef(Date.now());

  // ALL hooks called unconditionally — before any early returns
  useEffect(() => {
    if (queue.length === 0 || currentIdx >= queue.length) return;
    setRevealed(false);
    setTargetWord(null);
    setState("question");
    setTargetWord(extractTarget(queue[currentIdx]!.sentence.text, queue[currentIdx]!.tokens, queue[currentIdx]!.wordEntriesMap));
  }, [currentIdx, queue]);

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

  const currentCard = queue[currentIdx]!;
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
      setState("question");
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

  return (
    <div className="rev-main">
      <ReviewTopBar
        current={currentIdx + 1}
        total={queue.length}
        againCount={againCount}
        learnCount={learnCount}
        dueCount={dueCount}
        onExit={onComplete}
      />

      <div className="rev-stage">
        {embedPlaying && (
          <ReviewEmbed
            videoId={currentCard.clip.sourceId}
            startMs={currentCard.clip.startMs}
            endMs={currentCard.clip.endMs}
            onEnded={() => setEmbedPlaying(false)}
          />
        )}

        <ReviewCard
          sentence={currentCard.sentence}
          target={targetWord}
          revealed={revealed}
          clip={{
            sourceId: currentCard.clip.sourceId,
            startMs: currentCard.clip.startMs,
            endMs: currentCard.clip.endMs,
          }}
          source={{
            channel: "YouTube",
            videoTitle: currentCard.clip.sourceId,
            thumbnailUrl: `https://img.youtube.com/vi/${currentCard.clip.sourceId}/mqdefault.jpg`,
          }}
          notes={localNotes[currentCard.cardId] ?? currentCard.notes}
          onPlayClip={() => setEmbedPlaying(true)}
          onEditNotes={handleEditNotes}
        />
      </div>

      <ReviewDock
        revealed={revealed}
        grades={computeGrades(currentCard.intervals)}
        onShowAnswer={() => {
          setRevealed(true);
          setState("answer");
        }}
        onGrade={handleGrade}
      />
    </div>
  );
}
