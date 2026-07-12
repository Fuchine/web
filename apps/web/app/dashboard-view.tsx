"use client";

import { useState, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";

/* ---- icons ---- */
function IPlay(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IReview(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 11A8 8 0 1 0 18 16.5M20 5v6h-6" />
    </svg>
  );
}
function ICheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}
function IYoutube(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IPlus(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ILibrary(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
      <rect x="14" y="14" width="6" height="5" rx="1" />
    </svg>
  );
}
function IStats(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19.5h16M7 19.5v-7M12 19.5V6M17 19.5v-4" />
    </svg>
  );
}
function ISpark(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z" />
    </svg>
  );
}
function IArrow(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ---- types ---- */
export type DashboardVideo = {
  id: string;
  title: string;
  channel: string | null;
  source: string;
  sourceId: string;
  durationS: number | null;
};

export type DashboardGoal = {
  key: "newCards" | "reviews" | "watchMinutes";
  done: number;
  goal: number;
};

export type DashboardProps = {
  account: { name: string; sub?: string };
  reviewDue: number;
  todaysGoals: DashboardGoal[];
  continueVideo: DashboardVideo | null;
};

/* ---- helpers ---- */
function firstName(name: string) {
  // If it's an email, use the local part before @, capitalised
  if (name.includes("@")) {
    const local = name.split("@")[0] ?? name;
    // Strip numbers/dots/underscores suffix, e.g. "gabriel.playhard10" → "gabriel"
    const base = local.split(/[._\d]/)[0] ?? local;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return name.split(" ")[0] ?? name;
}

function fmtDur(s: number | null): string | null {
  if (!s || s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function ytThumb(sourceId: string) {
  return `https://img.youtube.com/vi/${sourceId}/mqdefault.jpg`;
}

/* ---- sub-components ---- */

function BtnPrimary({
  onClick, children, className = "",
}: {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-[9px] rounded-[var(--radius)] border-0 bg-accent " +
        "px-[22px] text-[14.5px] font-[550] text-on-accent transition-[background,transform] " +
        "hover:bg-accent-hover active:bg-accent-press active:translate-y-[0.5px] cursor-pointer " +
        className
      }
    >
      {children}
    </button>
  );
}

function BtnGhost({
  onClick, children,
}: {
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex h-[46px] items-center gap-[9px] rounded-[var(--radius)] border border-border-strong " +
        "bg-surface px-5 text-[14.5px] font-[550] text-fg transition-[border-color,background] " +
        "hover:border-faint cursor-pointer"
      }
    >
      {children}
    </button>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="mb-[14px] flex items-baseline justify-between">
      <h2 className="m-0 text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">
        {title}
      </h2>
    </div>
  );
}

function HeroReviews({ due }: { due: number }) {
  const router = useRouter();
  const calm = due === 0;

  if (calm) {
    return (
      <div className="flex items-center justify-between gap-7 overflow-hidden rounded-[22px] border border-border bg-bg-2 px-9 py-[34px]">
        <div className="flex items-center gap-4">
          <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-ok-soft text-ok">
            <ICheck className="h-[22px] w-[22px]" />
          </span>
          <div>
            <p className="m-0 mb-1 text-[18px] font-[600] -tracking-[0.01em] text-fg">
              All caught up — nothing to review
            </p>
            <p className="m-0 text-[13.5px] text-muted">
              Your deck is clear. New cards appear as you mine words from videos.
            </p>
          </div>
        </div>
        <div className="flex-none">
          <BtnGhost onClick={() => router.push("/library")}>
            <IPlay className="h-[17px] w-[17px]" /> Find something to watch
          </BtnGhost>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-7 overflow-hidden rounded-[22px] border border-accent-line bg-accent-soft px-9 py-[34px]">
      <div className="flex items-baseline gap-[18px]">
        <span className="font-[600] leading-[0.9] -tracking-[0.03em] text-accent tabular-nums" style={{ fontSize: 58 }}>
          {due}
        </span>
        <div className="pt-1">
          <p className="m-0 mb-1 text-[18px] font-[600] -tracking-[0.01em] text-fg">
            cards to review today
          </p>
          <p className="m-0 text-[13.5px] text-muted">
            About {Math.ceil(due * 0.35)} minutes to clear your deck
          </p>
        </div>
      </div>
      <div className="flex-none">
        <BtnPrimary className="h-[46px]" onClick={() => router.push("/review")}>
          <IReview className="h-[17px] w-[17px]" /> Review now
        </BtnPrimary>
      </div>
    </div>
  );
}

function ContinueWatching({ video }: { video: DashboardVideo }) {
  const router = useRouter();
  const dur = fmtDur(video.durationS);
  const thumb = video.source === "youtube" ? ytThumb(video.sourceId) : undefined;

  return (
    <section className="rise-3 mt-[38px]">
      <SectionHead title="Continue watching" />
      <div className="flex items-center gap-5 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
        {/* Thumbnail */}
        <button
          onClick={() => router.push(`/videos/${video.id}`)}
          aria-label={`Resume ${video.title}`}
          className="relative aspect-video w-[196px] flex-none cursor-pointer overflow-hidden rounded-[11px] border border-border p-0 transition-[transform,box-shadow] hover:-translate-y-[2px] hover:shadow-[var(--shadow)]"
          style={{ background: "linear-gradient(155deg, var(--indigo-2), var(--indigo-deep))" }}
        >
          {thumb && (
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {/* play overlay */}
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[rgba(255,255,255,0.14)] text-white backdrop-blur-[2px]">
              <IPlay className="ml-[2px] h-[15px] w-[15px]" />
            </span>
          </span>
          {dur && (
            <span className="absolute bottom-[7px] right-[7px] rounded-[5px] bg-[rgba(8,12,22,0.6)] px-[6px] py-[1px] text-[11px] font-[500] tabular-nums text-white">
              {dur}
            </span>
          )}
        </button>

        {/* Meta */}
        <div className="min-w-0 flex-1">
          <p className="m-0 mb-[5px] text-[11.5px] uppercase tracking-[0.04em] text-faint">
            Last added
          </p>
          <p className="m-0 mb-1 line-clamp-2 text-[15.5px] font-[550] leading-[1.45] text-fg">
            {video.title}
          </p>
          {video.channel && (
            <p className="m-0 mb-3 truncate text-[12.5px] text-faint">{video.channel}</p>
          )}
        </div>

        {/* Action */}
        <div className="flex-none pr-[6px]">
          <BtnPrimary className="h-[46px]" onClick={() => router.push(`/videos/${video.id}`)}>
            <IPlay className="h-[17px] w-[17px]" /> Resume
          </BtnPrimary>
        </div>
      </div>
    </section>
  );
}

const GOAL_META: Record<DashboardGoal["key"], { label: string; unit: string }> = {
  newCards: { label: "New cards", unit: "" },
  reviews: { label: "Reviews", unit: "" },
  watchMinutes: { label: "Watch time", unit: "min" },
};

function GoalCard({ goal }: { goal: DashboardGoal }) {
  const { label, unit } = GOAL_META[goal.key];
  const pct = goal.goal > 0 ? Math.min(100, Math.round((goal.done / goal.goal) * 100)) : 0;
  const met = goal.done >= goal.goal;

  return (
    <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-[10px] flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-[600] text-fg">{label}</span>
        <span className="text-[12.5px] tabular-nums text-muted">
          <span className={met ? "font-[600] text-ok" : "font-[600] text-fg"}>{goal.done}</span>
          {" / "}
          {goal.goal}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-bg-2">
        <div
          className={"h-full rounded-full transition-[width] " + (met ? "bg-ok" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GoalsToday({ goals }: { goals: DashboardGoal[] }) {
  return (
    <section className="rise-3 mt-[38px]">
      <SectionHead title="Today's goals" />
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        {goals.map((g) => (
          <GoalCard key={g.key} goal={g} />
        ))}
      </div>
    </section>
  );
}

function QuickImport() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  return (
    <div className="flex gap-[10px]">
      <div className="relative flex flex-1 items-center">
        <IYoutube className="pointer-events-none absolute left-[14px] h-[19px] w-[19px] text-faint" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") router.push("/import"); }}
          placeholder="Paste a YouTube link to study"
          className={
            "h-[48px] w-full rounded-[var(--radius)] border border-border-strong bg-field " +
            "pl-[44px] pr-[14px] text-[14.5px] text-fg outline-none " +
            "transition-[border-color,box-shadow] placeholder:text-faint " +
            "hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]"
          }
        />
      </div>
      <BtnPrimary className="h-[48px]" onClick={() => router.push("/import")}>
        <IPlus className="h-[17px] w-[17px]" /> Import
      </BtnPrimary>
    </div>
  );
}

function JumpOffs() {
  const router = useRouter();
  return (
    <section className="rise-3 mt-[38px]">
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        {/* Library */}
        <button
          onClick={() => router.push("/library")}
          className={
            "flex w-full items-center gap-[13px] rounded-[16px] border border-border " +
            "bg-surface p-4 text-left font-[inherit] transition-[border-color,box-shadow,transform] " +
            "hover:border-border-strong hover:shadow-[var(--shadow-sm)] hover:-translate-y-[1px] " +
            "cursor-pointer group"
          }
        >
          <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-accent-soft text-accent">
            <ILibrary className="h-[19px] w-[19px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="truncate text-[14px] font-[600] -tracking-[0.005em] text-fg">Open library</span>
            <span className="truncate text-[12.5px] text-faint">Browse everything you&apos;ve added</span>
          </span>
          <span className="flex-none text-faint transition-[transform,color] group-hover:translate-x-[2px] group-hover:text-accent">
            <IArrow className="h-[17px] w-[17px]" />
          </span>
        </button>

        {/* Stats — soon */}
        <div className="flex items-center gap-[13px] rounded-[16px] border border-dashed border-border-strong bg-transparent p-4">
          <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-bg-2 text-faint">
            <IStats className="h-[19px] w-[19px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="truncate text-[14px] font-[550] text-muted">Your stats</span>
            <span className="truncate text-[12.5px] text-faint">Watch time, words, streaks</span>
          </span>
          <span className="flex-none rounded-[6px] border border-border px-[8px] py-[3px] text-[10.5px] font-[600] uppercase tracking-[0.05em] text-faint">
            Soon
          </span>
        </div>

        {/* Recommendations — soon */}
        <div className="flex items-center gap-[13px] rounded-[16px] border border-dashed border-border-strong bg-transparent p-4">
          <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-bg-2 text-faint">
            <ISpark className="h-[19px] w-[19px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="truncate text-[14px] font-[550] text-muted">Recommendations</span>
            <span className="truncate text-[12.5px] text-faint">Picks from what you watch</span>
          </span>
          <span className="flex-none rounded-[6px] border border-border px-[8px] py-[3px] text-[10.5px] font-[600] uppercase tracking-[0.05em] text-faint">
            Soon
          </span>
        </div>
      </div>
    </section>
  );
}

function FirstRun() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  return (
    <div className="mx-auto flex min-h-full max-w-[640px] flex-col justify-center px-14 pb-20 pt-10">
      {/* Mark */}
      <div
        className="rise mb-7 grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-accent pb-[2px] text-on-accent"
        style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 28, lineHeight: 1 }}
      >
        淵
      </div>
      {/* Heading */}
      <div className="rise">
        <h1 className="m-0 mb-3 text-[30px] font-[600] -tracking-[0.02em] leading-[1.18]">
          Welcome to Fuchine.
        </h1>
        <p className="m-0 mb-[34px] max-w-[30em] text-[16px] leading-[1.6] text-muted">
          Learn Japanese by watching what you love. Paste any YouTube video and we&apos;ll turn
          it into a study session — subtitles, a dictionary, and review built in.
        </p>
      </div>
      {/* Import row */}
      <div className="rise-2 mb-[18px]">
        <div className="flex gap-[10px]">
          <div className="relative flex flex-1 items-center">
            <IYoutube className="pointer-events-none absolute left-[14px] h-[19px] w-[19px] text-faint" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") router.push("/import"); }}
              placeholder="Paste a YouTube link to study"
              className={
                "h-[50px] w-full rounded-[var(--radius)] border border-border-strong bg-field " +
                "pl-[44px] pr-[14px] text-[14.5px] text-fg outline-none " +
                "transition-[border-color,box-shadow] placeholder:text-faint " +
                "hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]"
              }
            />
          </div>
          <BtnPrimary className="h-[50px]" onClick={() => router.push("/import")}>
            <IPlus className="h-[17px] w-[17px]" /> Import
          </BtnPrimary>
        </div>
      </div>
      {/* Hint */}
      <div className="rise-3 flex items-center gap-2 text-[13px] text-faint">
        <ISpark className="h-[15px] w-[15px]" />
        Try a vlog, a news clip, or a cooking video — anything in Japanese works.
      </div>
    </div>
  );
}

/* ---- main export ---- */
export function DashboardView({ account, reviewDue, todaysGoals, continueVideo }: DashboardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const firstRun = continueVideo === null;

  const sub = reviewDue === 0
    ? "You're all caught up. Pick up where you left off, or bring in something new."
    : "You have a review waiting" + (continueVideo ? " and a video to finish." : ".");

  return (
    <AppLayout
      account={account}
      reviewDue={reviewDue}
      activeKey="home"
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
    >
      {firstRun ? (
        <FirstRun />
      ) : (
        <div className="mx-auto max-w-[880px] px-14 pb-20 pt-14">
          {/* Greeting */}
          <div className="mb-10 rise">
            <h1 className="m-0 mb-[5px] text-[27px] font-[600] -tracking-[0.02em]">
              Welcome back, {firstName(account.name)}.
            </h1>
            <p className="m-0 text-[14.5px] text-muted">{sub}</p>
          </div>

          {/* Hero: reviews */}
          <div className="rise-2">
            <HeroReviews due={reviewDue} />
          </div>

          {/* Today's goals — only when the user has set any */}
          {todaysGoals.length > 0 && <GoalsToday goals={todaysGoals} />}

          {/* Continue watching */}
          {continueVideo && <ContinueWatching video={continueVideo} />}

          {/* Quick import */}
          <section className="mt-[38px] rise-3">
            <SectionHead title="Quick import" />
            <QuickImport />
          </section>

          {/* Jump-offs */}
          <JumpOffs />
        </div>
      )}
    </AppLayout>
  );
}
