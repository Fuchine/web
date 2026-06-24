"use client";

import { useRouter } from "next/navigation";

/* ---- mock data ---- */

const STATS = { cards: 24, time: "8:12", retention: 88, streak: 12 };
const GRADES = [
  { label: "Again", n: 3, cls: "again" },
  { label: "Hard", n: 5, cls: "hard" },
  { label: "Good", n: 12, cls: "good" },
  { label: "Easy", n: 4, cls: "easy" },
];
const WEEK = [true, true, true, true, true, true, true];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MATURED = [
  { w: "川沿い", r: "かわぞい", g: "riverside" },
  { w: "澄んで", r: "すんで", g: "to be clear" },
  { w: "最適", r: "さいてき", g: "optimal" },
];

const total = GRADES.reduce((s, g) => s + g.n, 0);

const today = new Date();
const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];
const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][today.getMonth()];
const dateStr = `${dayName}, ${monthName} ${today.getDate()}`;

/* ---- sidebar ---- */

const NAV = [
  { key: "home", label: "Home", path: "/",
    icon: <><path d="M3.5 10.2 12 3.5l8.5 6.7" /><path d="M5.5 9v10.5h13V9" /></> },
  { key: "library", label: "Library", path: "/",
    icon: <><rect x="3.5" y="4.5" width="7" height="15" rx="1.4" /><rect x="13.5" y="4.5" width="7" height="9.5" rx="1.4" /><path d="M13.5 17.5h7" /></> },
  { key: "review", label: "Review", path: "/review",
    icon: <><path d="M20 7.5A8 8 0 1 0 21 12" /><path d="M20 4v3.5h-3.5" /></> },
  { key: "settings", label: "Settings", path: "/settings",
    icon: <><circle cx="12" cy="12" r="2.6" /><path d="M12 3.5v2M12 18.5v2M4.7 7.2l1.7 1M17.6 15.8l1.7 1M3.5 12h2M18.5 12h2M4.7 16.8l1.7-1M17.6 8.2l1.7-1" /></> },
];

interface Props {
  accountName: string;
  accountEmail: string;
}

/* ---- component ---- */

export function SummaryView({ accountName, accountEmail }: Props) {
  const router = useRouter();
  const initial = accountName.charAt(0).toUpperCase();

  return (
    <>
      <style>{`
        .sum-rise { animation: sum-rise 0.4s var(--ease); }
        @keyframes sum-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .sum-rise { animation: none; } }
      `}</style>

      <div className="grid h-full" style={{ gridTemplateColumns: "76px 1fr" }}>
        {/* sidebar */}
        <aside className="flex flex-col overflow-hidden border-r border-border bg-bg-2 px-[14px] pb-4 pt-[18px]">
          <div className="mb-[22px] flex h-10 items-center gap-[10px] px-[6px]">
            <span className="grid flex-none place-items-center rounded-[8px] bg-accent text-[16px] text-on-accent"
              style={{ width: 28, height: 28, fontFamily: "'Noto Serif JP', serif", paddingBottom: 1, lineHeight: 1 }}>
              淵
            </span>
            <span className="whitespace-nowrap text-[16px] font-[600] -tracking-[0.01em] text-fg opacity-0">
              Fuchine
            </span>
          </div>

          <nav className="flex flex-col gap-[3px]">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => router.push(item.path)}
                className={`flex h-10 w-full items-center justify-center gap-0 whitespace-nowrap rounded-[var(--radius)] border-none bg-transparent px-0 text-left text-[14px] font-[500] text-muted transition-[background,color] duration-[0.16s] ease-[var(--ease)] hover:bg-bg hover:text-fg ${
                  item.key === "review" ? "bg-accent text-on-accent hover:bg-accent" : ""
                }`}
                title={item.label}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  className="h-[19px] w-[19px] flex-none">
                  {item.icon}
                </svg>
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          <div className="mt-2 border-t border-border pt-[14px]">
            <button className="flex w-full items-center justify-center gap-0 rounded-[var(--radius)] border-none bg-transparent px-0 py-[7px] hover:bg-bg">
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[12.5px] font-[600] text-on-indigo"
                style={{ background: "linear-gradient(150deg, var(--indigo-2), var(--indigo-deep))" }}>
                {initial}
              </span>
              <div className="flex min-w-0 flex-col gap-px opacity-0">
                <span className="whitespace-nowrap text-[13.5px] font-[550] text-fg">{accountName}</span>
                <span className="whitespace-nowrap text-[12px] text-faint">{accountEmail}</span>
              </div>
            </button>
          </div>
        </aside>

        {/* main */}
        <div className="flex min-w-0 overflow-hidden">
          <div className="flex flex-1 justify-center overflow-y-auto px-[26px] py-14 pb-12">
            <div className="sum-rise w-full" style={{ maxWidth: 620 }}>
              {/* header */}
              <div className="mb-[34px] text-center">
                <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[16px] bg-accent text-[28px] text-on-accent shadow-[var(--shadow)]"
                  style={{ fontFamily: "'Noto Serif JP', serif", paddingBottom: 2, lineHeight: 1 }}>
                  淵
                </span>
                <h1 className="m-0 text-[30px] font-[600] -tracking-[0.02em] text-fg">Session complete</h1>
                <p className="m-0 mt-[7px] text-[14px] text-muted">Reviewed {total} cards · {dateStr}</p>
              </div>

              {/* hero stats */}
              <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
                {[
                  { n: STATS.cards, l: "Cards reviewed", noUnit: true },
                  { n: STATS.time, l: "Time" },
                  { n: STATS.retention, l: "Retention", unit: "%" },
                ].map((s, i) => (
                  <div key={i} className="border-r border-border px-5 py-6 text-center last:border-r-0">
                    <span className="block text-[34px] font-[600] leading-none -tracking-[0.02em] tabular-nums text-fg">
                      {s.n}{s.unit && <span className="ml-px text-[19px] text-muted">{s.unit}</span>}
                    </span>
                    <span className="mt-[9px] block text-[12.5px] text-muted">{s.l}</span>
                  </div>
                ))}
              </div>

              {/* how it went */}
              <div className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface px-[22px] py-5 shadow-[var(--shadow-sm)]">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">How it went</span>
                  <span className="tabular-nums text-[12.5px] text-faint">{total} ratings</span>
                </div>
                <div className="flex h-3 gap-[3px] overflow-hidden rounded-[6px]">
                  {GRADES.map((g) => (
                    <div
                      key={g.label}
                      className={`min-w-[6px] rounded-[3px] ${
                        g.cls === "again" ? "bg-error" : g.cls === "hard" ? "bg-[oklch(0.66_0.11_70)]" : g.cls === "good" ? "bg-link" : "bg-ok"
                      }`}
                      style={{ flexGrow: g.n }}
                      title={`${g.label} · ${g.n}`}
                    />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2">
                  {GRADES.map((g) => (
                    <div key={g.label} className="inline-flex items-center gap-[7px]">
                      <span className={`h-[9px] w-[9px] rounded-full ${
                        g.cls === "again" ? "bg-error" : g.cls === "hard" ? "bg-[oklch(0.66_0.11_70)]" : g.cls === "good" ? "bg-link" : "bg-ok"
                      }`} />
                      <span className="text-[13px] text-muted">{g.label}</span>
                      <span className="tabular-nums text-[13px] font-[600] text-fg">{g.n}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* two-up grid */}
              <div className="mb-4 grid grid-cols-[1fr_1fr] gap-4 max-md:grid-cols-1">
                {/* streak */}
                <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-[22px] py-5 shadow-[var(--shadow-sm)]">
                  <div className="mb-4 flex items-baseline justify-between gap-4">
                    <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Streak</span>
                  </div>
                  <div className="mb-4 text-[26px] font-[450] text-muted">
                    <b className="text-[30px] font-[600] -tracking-[0.01em] text-fg">{STATS.streak}</b> days
                  </div>
                  <div className="flex gap-[9px]">
                    {WEEK.map((on, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-[7px]">
                        <span className={`grid h-[30px] w-[30px] place-items-center rounded-full border ${
                          on ? "border-accent bg-accent text-on-accent" : "border-[var(--border-strong)] text-transparent"
                        }`}>
                          {on && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[15px] w-[15px]">
                              <path d="M5 12.5 10 17.5 19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="text-[11.5px] font-[500] text-faint">{DAYS[i]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-pretty text-[12.5px] leading-[1.5] text-muted">
                    Reviewed every day this week. Come back tomorrow to keep it alive.
                  </p>
                </div>

                {/* matured words */}
                <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-[22px] py-5 shadow-[var(--shadow-sm)]">
                  <div className="mb-4 flex items-baseline justify-between gap-4">
                    <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">Words matured</span>
                    <span className="tabular-nums text-[12.5px] text-faint">+3 known</span>
                  </div>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {MATURED.map((m) => (
                      <li key={m.w} className="flex items-center gap-[10px] border-b border-border py-[10px] last:border-b-0">
                        <span className="text-[16px] font-[600] text-fg">
                          {m.w}
                          <span className="ml-[6px] text-[11.5px] font-[400] text-faint">{m.r}</span>
                        </span>
                        <span className="flex-1 text-[13px] text-muted">{m.g}</span>
                        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-[var(--ok-soft)] text-ok">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[13px] w-[13px]">
                            <path d="M5 12.5 10 17.5 19 7" />
                          </svg>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* actions */}
              <div className="mt-[26px] flex gap-3">
                <a href="/"
                  className="flex flex-1 items-center justify-center gap-[9px] rounded-[999px] border border-[var(--border-strong)] bg-surface px-4 py-[13px] text-[15px] font-[600] text-fg no-underline shadow-none transition-[background,border-color,color,transform] duration-[0.15s] hover:border-[var(--text-faint)] active:translate-y-px">
                  Back to home
                </a>
                <a href="/"
                  className="flex flex-1 items-center justify-center gap-[9px] rounded-[999px] border border-accent bg-accent px-4 py-[13px] text-[15px] font-[600] text-on-accent no-underline shadow-[var(--shadow-sm)] transition-[background,border-color,color,transform] duration-[0.15s] hover:bg-[var(--accent-hover)] active:translate-y-px">
                  Keep immersing
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
