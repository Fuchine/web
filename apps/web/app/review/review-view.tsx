"use client";

import { useState } from "react";
import { Button, ReviewSession, type ReviewSessionProps } from "@fuchine/ui";
type ReviewItem = {
  cardId: string;
  videoId: string;
  cardType: string;
  notes: string | null;
  due: Date;
  clip: { source: string; sourceId: string; startMs: number; endMs: number };
  sentence: { text: string; translation: string | null };
  intervals: Record<string, Date>;
};

function youtubeThumbnail(sourceId: string) {
  return `https://img.youtube.com/vi/${sourceId}/mqdefault.jpg`;
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="ml-[2px] h-[15px] w-[15px]" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export function ReviewView({ initialQueue }: { initialQueue: ReviewItem[] }) {
  const [mode, setMode] = useState<"list" | "session">("list");
  const [queue] = useState(initialQueue as ReviewItem[]);
  const calm = queue.length === 0;

  if (mode === "session") {
    return <ReviewSession queue={initialQueue as ReviewSessionProps["queue"]} onComplete={() => setMode("list")} />;
  }

  return (
    <div className="px-8 py-9">
      <div className="mb-7 flex items-center gap-4">
        <h1 className="m-0 flex-1 text-[22px] font-[600] -tracking-[0.01em] text-fg">Review</h1>
      </div>

      {/* Hero */}
      <div
        className="mb-10 flex items-center justify-between gap-7 rounded-[22px] px-9 py-8"
        style={{
          background: calm ? "var(--bg-2)" : "var(--accent-soft)",
          border: `1px solid ${calm ? "var(--border)" : "var(--accent-line)"}`,
        }}
      >
        <div className="flex items-baseline gap-4">
          {calm ? (
            <>
              <span className="grid h-12 w-12 flex-none place-items-center rounded-full" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
                <CheckIcon />
              </span>
              <div>
                <p className="m-0 text-[18px] font-[600] -tracking-[0.01em] text-fg">Nothing to review right now</p>
                <p className="m-0 mt-1 text-[13.5px] text-muted">You&apos;re all caught up. How about watching something?</p>
              </div>
            </>
          ) : (
            <>
              <span className="text-[58px] font-[600] leading-[0.9] -tracking-[0.03em] tabular-nums text-accent">
                {queue.length}
              </span>
              <div>
                <p className="m-0 text-[18px] font-[600] -tracking-[0.01em] text-fg">cards to review today</p>
                <p className="m-0 mt-1 text-[13.5px] text-muted">
                  {queue.length} cards · about {Math.ceil(queue.length * 0.4)} minutes
                </p>
              </div>
            </>
          )}
        </div>

        {!calm && (
          <Button variant="primary" icon={<PlayIcon />} onClick={() => setMode("session")}>
            Review now
          </Button>
        )}
        {calm && (
          <Button variant="ghost" icon={<PlayIcon />}>
            Find something to watch
          </Button>
        )}
      </div>

      {/* Queue — placeholder for T1.7 full session UI */}
      {queue.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Your cards</h2>
          {queue.map((card) => (
            <div key={card.cardId} className="flex items-center gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
              <div
                className="h-20 w-36 flex-none overflow-hidden rounded-[11px] bg-cover bg-center"
                style={{
                  backgroundImage: `url(${youtubeThumbnail(card.clip.sourceId)})`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 mb-1 truncate font-[550] text-[14px] text-fg jp">{card.sentence.text}</p>
                {card.sentence.translation && (
                  <p className="m-0 truncate text-[13px] text-muted">{card.sentence.translation}</p>
                )}
                <p className="m-0 mt-1 text-[11.5px] text-faint">
                  Due {card.due.toLocaleDateString()} · {card.cardType}
                </p>
              </div>
              <Button variant="ghost" size="sm">
                Study
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
