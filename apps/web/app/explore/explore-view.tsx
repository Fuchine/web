"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VideoCard } from "@fuchine/ui";
import type { ExploreItem, StarterChannel } from "@/lib/explore";
import { BAND_PRESETS, bandKey, type CoverageBand } from "@/lib/explore-rank";
import { LEVEL } from "@/lib/library";

function dur(s: number | null): string | undefined {
  if (!s || s <= 0) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const LEVEL_LABEL: Record<StarterChannel["level"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function ExploreView({
  band,
  items,
  refreshing,
  coldStart,
  starter,
  knownWords,
  catalogSize,
}: {
  band: CoverageBand;
  items: ExploreItem[];
  refreshing: boolean;
  coldStart: boolean;
  starter: StarterChannel[];
  knownWords: number;
  catalogSize: number;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const visible = items.filter((i) => !dismissed.has(i.video.id));

  const notInterested = (videoId: string) => {
    setDismissed((s) => new Set(s).add(videoId));
    fetch(`/api/videos/${videoId}/flags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flag: "not_interested" }),
    }).catch(() => {});
  };

  return (
    <div className="rise mx-auto max-w-[1180px] px-4 pb-[72px] pt-10 sm:px-10 sm:pt-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-[27px] font-[600] -tracking-[0.02em] text-fg">Explore</h1>
          <p className="m-0 mt-2 max-w-[640px] text-[14px] text-muted">
            Videos where you already know most of the words — {band.lo}–{band.hi}% of the running text — so the rest
            is learnable from context. Closest to the target first, then new common words and channels you&apos;ve been
            watching.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[10px] border border-border bg-bg-2 p-1" role="group" aria-label="Target coverage">
          {BAND_PRESETS.map((b) => {
            const on = bandKey(b) === bandKey(band);
            return (
              <Link
                key={bandKey(b)}
                href={`/explore?band=${bandKey(b)}`}
                aria-current={on ? "true" : undefined}
                className={`rounded-[7px] px-2.5 py-1 text-[12.5px] font-[550] no-underline ${on ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"}`}
              >
                {b.lo}–{b.hi}%
              </Link>
            );
          })}
        </div>
      </div>

      {refreshing && (
        <p className="m-0 mb-4 text-[12.5px] text-faint" role="status">
          Updating with your latest activity — numbers may lag by a few minutes.
        </p>
      )}

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((i) => (
            <div key={i.video.id} className="min-w-0">
              <VideoCard
                title={i.video.title}
                channel={i.video.channel ?? ""}
                durationLabel={dur(i.video.durationS)}
                level={i.video.levelEstimate ? (LEVEL[i.video.levelEstimate] ?? undefined) : undefined}
                comprehension={i.coverage.headline}
                comprehensionBand={{ low: i.coverage.low, high: i.coverage.high, unique: i.coverage.unique }}
                thumbnailUrl={`https://img.youtube.com/vi/${i.video.sourceId}/mqdefault.jpg`}
                onPlay={() => router.push(`/videos/${i.video.id}`)}
              />
              <div className="mt-2 flex items-start justify-between gap-2">
                <p className="m-0 text-[12.5px] leading-[1.45] text-muted" data-testid="explore-reason">{i.reason}</p>
                <button
                  type="button"
                  onClick={() => notInterested(i.video.id)}
                  className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[12px] text-faint hover:bg-bg-2 hover:text-muted"
                  aria-label={`Not interested in ${i.video.title}`}
                >
                  Not interested
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center">
          <p className="m-0 text-[15px] font-[550] text-fg">Nothing in the {band.lo}–{band.hi}% band yet</p>
          <p className="m-0 mt-2 text-[14px] text-muted">
            {catalogSize === 0
              ? "The library is empty — import a video to get started."
              : "Try another target above, or import more videos so there is more to choose from."}
          </p>
        </div>
      )}

      {coldStart && starter.length > 0 && (
        <section className="mt-12" aria-labelledby="starter-title">
          <h2 id="starter-title" className="m-0 text-[18px] font-[600] text-fg">Start with comprehensible input</h2>
          <p className="m-0 mt-1.5 max-w-[640px] text-[13.5px] text-muted">
            {knownWords < 100
              ? "There isn't enough of your history yet to rank videos well. "
              : "The library is still small. "}
            These channels make videos for learners, graded by level. Find one on YouTube, then import it with the
            browser extension — Explore gets better with every video you watch.
          </p>
          <ul className="m-0 mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {starter.map((c) => (
              <li key={c.name} className="flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14.5px] font-[600] text-fg">{c.name}</span>
                  <span className="shrink-0 rounded-full bg-bg-2 px-2 py-[1px] text-[11px] font-[550] text-muted">{LEVEL_LABEL[c.level]}</span>
                </div>
                <p className="m-0 mt-1.5 flex-1 text-[13px] leading-[1.5] text-muted">{c.note}</p>
                <div className="mt-3 flex gap-3 text-[13px] font-[550]">
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-link no-underline hover:text-link-hover">
                    Find on YouTube ↗
                  </a>
                  <Link href="/import" className="text-link no-underline hover:text-link-hover">
                    Import a video
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
