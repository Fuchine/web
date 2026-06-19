"use client";

import { useEffect, useState } from "react";
import { GRADE, previewIntervals } from "@fuchine/core";
import { JaTokenizer } from "@fuchine/nlp";
import type { Token } from "@fuchine/db";
import { ReviewTopBar } from "./ReviewTopBar";
import { ReviewCard, type TargetWord } from "./ReviewCard";
import { ReviewDock } from "./ReviewDock";
import { ReviewEmbed } from "./ReviewEmbed";

export interface ReviewItem {
  cardId: string;
  videoId: string;
  cardType: string;
  notes: string | null;
  due: Date;
  clip: { source: string; sourceId: string; startMs: number; endMs: number };
  sentence: { text: string; translation: string | null };
  intervals: Record<string, Date>;
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

async function extractTarget(sentenceText: string): Promise<TargetWord | null> {
  const tokenizer = new JaTokenizer();
  const tokens: Token[] = await tokenizer.tokenize(sentenceText);

  const verbalTokens = tokens.filter(
    (t) =>
      t.pos.startsWith("動詞") ||
      t.pos.startsWith("形容詞") ||
      t.pos.startsWith("形状詞")
  );

  const target = verbalTokens[verbalTokens.length - 1] ?? null;
  if (!target) return null;

  return {
    surface: target.surface,
    reading: target.reading || "",
    lemma: target.lemma,
    meanings: [],
  };
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

export function ReviewSession({ queue, onComplete }: ReviewSessionProps) {
  const [state, setState] = useState<SessionState>("idle");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionDone, setSessionDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [targetWord, setTargetWord] = useState<TargetWord | null>(null);
  const [embedPlaying, setEmbedPlaying] = useState(false);

  if (queue.length === 0) {
    onComplete();
    return null;
  }

  if (currentIdx >= queue.length) {
    onComplete();
    return null;
  }

  const currentCard = queue[currentIdx]!;

  useEffect(() => {
    if (currentIdx >= queue.length) return;
    setRevealed(false);
    setTargetWord(null);
    setState("question");
    extractTarget(queue[currentIdx]!.sentence.text).then(setTargetWord);
  }, [currentIdx, queue]);

  async function handleGrade(grade: 1 | 2 | 3 | 4) {
    const card = queue[currentIdx];
    if (!card) return;
    const res = await fetch(`/api/review/${card.cardId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade }),
    });
    if (!res.ok) return;

    setSessionDone((d) => d + 1);
    if (currentIdx < queue.length - 1) {
      setCurrentIdx((i) => i + 1);
      setState("question");
    } else {
      onComplete();
    }
  }

  return (
    <div className="rev-main">
      <ReviewTopBar
        current={currentIdx + 1}
        total={queue.length}
        againCount={0}
        learnCount={0}
        dueCount={queue.length}
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
          onPlayClip={() => setEmbedPlaying(true)}
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