"use client";

import { useState } from "react";
import type { StatsData } from "@/lib/stats";

/* ---- static labels ---- */

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Format seconds as m:ss (matches the design's duration style). */
function fmtDuration(totalS: number | null): string {
  if (!totalS || totalS <= 0) return "—";
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---- icons ---- */

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 -rotate-45" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-[15px] w-[15px]" aria-hidden="true">
    <path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ---- component ---- */

export function StatsView({ data }: { data: StatsData }) {
  const [range, setRange] = useState("week");
  const { kpis } = data;

  const KPIS = [
    {
      k: "Words known",
      v: String(kpis.wordsKnown),
      d: kpis.wordsKnownDelta > 0 ? `+${kpis.wordsKnownDelta}` : "—",
      up: kpis.wordsKnownDelta > 0 ? true : null,
      sub: "this week",
    },
    {
      k: "Watch time",
      v: kpis.watchTimeHours.toFixed(1),
      u: "h",
      d: "this week",
      up: null,
      sub: "tracked",
    },
    {
      k: "Day streak",
      v: String(kpis.dayStreak),
      d: `Best: ${kpis.bestStreak}`,
      up: null,
      sub: "days",
    },
    {
      k: "Retention",
      v: String(kpis.retentionPct),
      u: "%",
      d: "30-day avg",
      up: null,
      sub: "correct",
    },
  ];

  const ACTIVITY = data.dailyActivityMin;
  const VOCAB = [
    { label: "Known", n: data.vocab.known, cls: "known" },
    { label: "Learning", n: data.vocab.learning, cls: "learning" },
    { label: "New", n: data.vocab.new, cls: "new" },
  ];
  const TOP = data.topSources.map((s) => ({
    title: s.title,
    words: s.words,
    dur: fmtDuration(s.durationS),
  }));
  const HEAT = data.heatmap;

  const maxAct = Math.max(1, ...ACTIVITY);
  const vocabTotal = VOCAB.reduce((s, v) => s + v.n, 0);
  const maxWords = Math.max(1, ...TOP.map((x) => x.words));
  const peakDay = ACTIVITY.indexOf(Math.max(...ACTIVITY));

  return (
    <>
      <div className="mx-auto max-w-[900px] px-8 py-14 pb-[72px]">
        {/* header */}
        <div className="rise mb-[26px] flex items-start justify-between gap-6">
          <div>
            <h1 className="m-0 text-[27px] font-[600] -tracking-[0.02em] text-fg">Stats</h1>
            <p className="m-0 mt-2 max-w-[52ch] text-[14px] leading-[1.5] text-muted">
              Your progress at a glance — watch time, vocabulary, and review consistency.
            </p>
          </div>
          <div className="inline-flex gap-[2px] rounded-[9px] border border-border bg-bg-2 p-[3px]">
            {[{ v: "week", l: "Week" }, { v: "month", l: "Month" }, { v: "year", l: "Year" }].map((o) => (
              <button
                key={o.v}
                onClick={() => setRange(o.v)}
                className={`rounded-[7px] px-[14px] py-[6px] text-[13px] font-[550] whitespace-nowrap transition-colors ${
                  range === o.v
                    ? "bg-surface text-fg shadow-[var(--shadow-sm)]"
                    : "bg-transparent text-faint hover:text-fg"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="rise-2 mb-4 grid grid-cols-4 gap-[14px] max-lg:grid-cols-2">
          {KPIS.map((kp) => (
            <div key={kp.k} className="rounded-[var(--radius-lg)] border border-border bg-surface p-[18px_20px] shadow-[var(--shadow-sm)]">
              <div className="text-[12.5px] text-muted">{kp.k}</div>
              <div className="mt-2 text-[32px] font-[600] leading-none -tracking-[0.02em] tabular-nums text-fg">
                {kp.v}
                {kp.u && <span className="ml-px text-[18px] text-muted">{kp.u}</span>}
              </div>
              <div className={`mt-[10px] flex items-center gap-1 text-[12px] font-[600] tabular-nums ${
                kp.up === true ? "text-ok" : kp.up === false ? "text-error" : "text-faint"
              }`}>
                {kp.up === true && <ArrowIcon />}
                {kp.d}
                <span className="font-[400] text-faint">· {kp.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* activity + vocabulary grid */}
        <div className="rise-3 mb-4 grid grid-cols-[1.3fr_1fr] gap-4 max-lg:grid-cols-1">
          {/* daily watch time bar chart */}
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-[20px_22px] shadow-[var(--shadow-sm)]">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Daily watch time</span>
              <span className="tabular-nums text-[12.5px] text-faint">{ACTIVITY.reduce((a, b) => a + b, 0)} min</span>
            </div>
            <div className="flex h-[180px] items-end gap-[10px]">
              {ACTIVITY.map((m, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-[9px] h-full">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`relative w-full min-h-[4px] rounded-[7px_7px_3px_3px] ${i === peakDay && m > 0 ? "bg-accent" : "bg-accent-soft-2"}`}
                      style={{ height: `${(m / maxAct) * 100}%` }}
                    >
                      <span className={`absolute top-[-19px] left-1/2 -translate-x-1/2 text-[11px] font-[600] tabular-nums ${i === peakDay && m > 0 ? "text-link" : "text-muted"}`}>{m}</span>
                    </div>
                  </div>
                  <span className="text-[12px] font-[500] text-faint">{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* vocabulary */}
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-[20px_22px] shadow-[var(--shadow-sm)]">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Vocabulary</span>
              <span className="tabular-nums text-[12.5px] text-faint">{vocabTotal} tracked</span>
            </div>
            <div className="flex h-[14px] gap-[3px] overflow-hidden rounded-[7px]">
              {VOCAB.map((v) => (
                <div
                  key={v.label}
                  className={`min-w-[8px] rounded-[3px] ${v.cls === "known" ? "bg-ok" : v.cls === "learning" ? "bg-[oklch(0.66_0.11_70)]" : "bg-link"}`}
                  style={{ flexGrow: v.n }}
                  title={`${v.label} · ${v.n}`}
                />
              ))}
            </div>
            <div className="mt-[18px] flex flex-col gap-[9px]">
              {VOCAB.map((v) => (
                <div key={v.label} className="flex items-center gap-[9px]">
                  <span className={`h-[9px] w-[9px] flex-none rounded-full ${
                    v.cls === "known" ? "bg-ok" : v.cls === "learning" ? "bg-[oklch(0.66_0.11_70)]" : "bg-link"
                  }`} />
                  <span className="flex-1 text-[13.5px] text-muted">{v.label}</span>
                  <span className="tabular-nums text-[13.5px] font-[600] text-fg">{v.n}</span>
                </div>
              ))}
            </div>
            <div className="mt-[18px] flex items-center gap-2 border-t border-border pt-4 text-[12.5px] text-muted">
              <span className="flex-none text-link"><SparkIcon /></span>
              {kpis.wordsKnownDelta > 0 ? (
                <>
                  {kpis.wordsKnownDelta} word{kpis.wordsKnownDelta === 1 ? "" : "s"} moved to{" "}
                  <b className="font-[600] text-fg">Known</b> this week.
                </>
              ) : (
                <>{vocabTotal > 0 ? "Keep reviewing to grow your Known count." : "Mine words to start tracking vocabulary."}</>
              )}
            </div>
          </div>
        </div>

        {/* review heatmap */}
        <div className="rise-3 rounded-[var(--radius-lg)] border border-border bg-surface p-[20px_22px] shadow-[var(--shadow-sm)]">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Review consistency</span>
            <span className="tabular-nums text-[12.5px] text-faint">Last 17 weeks · {kpis.dayStreak}-day streak</span>
          </div>
          <div className="flex gap-[10px]">
            <div className="flex flex-col justify-between pb-0.5 pt-[14px] text-[10.5px] text-faint">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>
            <div className="flex flex-1 gap-[4px] overflow-hidden">
              {HEAT.map((col, c) => (
                <div key={c} className="flex flex-1 flex-col gap-[4px]">
                  {col.map((lvl, r) => (
                    <span
                      key={r}
                      className={`block aspect-square w-full rounded-[3px] ${
                        lvl === 0 ? "bg-bg-2 border border-border" :
                        lvl === 1 ? "bg-accent-soft border border-accent-line" :
                        lvl === 2 ? "bg-accent-soft-2 border border-accent-line" :
                        lvl === 3 ? "bg-[oklch(0.62_0.09_252)]" :
                        "bg-accent"
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-[14px] flex items-center justify-end gap-[5px] text-[11.5px] text-faint">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span
                key={l}
                className={`h-[13px] w-[13px] rounded-[3px] ${
                  l === 0 ? "bg-bg-2 border border-border" :
                  l === 1 ? "bg-accent-soft border border-accent-line" :
                  l === 2 ? "bg-accent-soft-2 border border-accent-line" :
                  l === 3 ? "bg-[oklch(0.62_0.09_252)]" :
                  "bg-accent"
                }`}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        {/* top sources */}
        <div className="rise-3 rounded-[var(--radius-lg)] border border-border bg-surface p-[20px_22px] shadow-[var(--shadow-sm)]">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Top sources by words mined</span>
          </div>
          <div className="flex flex-col gap-[4px]">
            {TOP.length === 0 && (
              <p className="m-0 py-2 text-[13.5px] text-faint">No mined words yet — save phrases from the player to see your top sources.</p>
            )}
            {TOP.map((v, i) => (
              <div key={i} className="flex items-center gap-[14px] border-b border-border py-[10px] last:border-b-0">
                <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] border border-border bg-bg-2 text-[12px] font-[600] text-muted">
                  {i + 1}
                </span>
                <div className="flex w-[230px] flex-none flex-col gap-px min-w-0 max-lg:w-[150px]">
                  <span className="truncate text-[14px] font-[550] text-fg">{v.title}</span>
                  <span className="tabular-nums text-[11.5px] text-faint">{v.dur}</span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-[4px] bg-accent-soft-2">
                  <div className="h-full rounded-[4px] bg-accent" style={{ width: `${(v.words / maxWords) * 100}%` }} />
                </div>
                <span className="min-w-[68px] flex-none text-right tabular-nums text-[13px] text-muted">
                  <b className="font-[600] text-fg">{v.words}</b> words
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
