"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* ---- icons ---- */
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);
const CaptionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7 11.5h2.5M7 14.5h4" />
    <path d="M13.5 11.5H17M13.5 14.5h2" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="10.6" width="14" height="9.4" rx="2.2" />
    <path d="M8 10.6V7.7a4 4 0 0 1 8 0v2.9" />
  </svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" /><path d="M12 8h.01" />
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z" />
    <circle cx="12" cy="12" r="2.9" />
  </svg>
);
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4l16 16" />
    <path d="M9.9 5.4A8.6 8.6 0 0 1 12 5.2c5 0 8.5 4.4 8.5 6.8a10 10 0 0 1-2.2 3" />
    <path d="M6.4 7.1C4.2 8.4 2.5 10.6 2.5 12c0 2.4 3.5 6.8 9.5 6.8a9.3 9.3 0 0 0 3.6-.7" />
    <path d="M9.8 9.9a3 3 0 0 0 4.1 4.1" />
  </svg>
);

/* ---- types ---- */
type Step = "welcome" | "language" | "goals" | "key" | "done";
const NUMBERED: Step[] = ["welcome", "language", "goals", "key"];

/** Onboarding goal defaults — gentle, immersion-first (tunable in Settings). */
const DEFAULT_NEW_CARDS = 20;
const DEFAULT_WATCH_MIN = 20;

const LANGS = [
  { v: "en", name: "English",   native: "English",              flag: "Recommended" },
  { v: "pt", name: "Português", native: "Portuguese",           flag: "" },
  { v: "es", name: "Español",   native: "Spanish",              flag: "" },
  { v: "zh", name: "中文",       native: "Chinese (Simplified)", flag: "" },
  { v: "ko", name: "한국어",     native: "Korean",               flag: "" },
];

const PROVIDERS = [
  { v: "anthropic", l: "Anthropic", ph: "sk-ant-…" },
  { v: "openai",    l: "OpenAI",    ph: "sk-…" },
  { v: "gemini",    l: "Gemini",    ph: "AIza…" },
  { v: "local",     l: "Local",     ph: "http://localhost:11434" },
];

/* ---- Progress ---- */
function Progress({ step }: { step: Step }) {
  const idx = NUMBERED.indexOf(step);
  const current = idx < 0 ? NUMBERED.length : idx;
  return (
    <div className="flex items-center gap-[13px] mb-[30px]">
      <div className="flex gap-[6px]">
        {NUMBERED.map((_, i) => (
          <i
            key={i}
            className={[
              "not-italic h-[3px] rounded-[3px]",
              "transition-[width,background,opacity] duration-[0.4s] ease-[var(--ease)]",
              "motion-reduce:transition-none",
              i < current
                ? "w-[24px] bg-accent opacity-50"
                : i === current
                  ? "w-[32px] bg-accent"
                  : "w-[24px] bg-border-strong",
            ].join(" ")}
          />
        ))}
      </div>
      <span className="text-[12px] font-medium tracking-[0.03em] text-faint">
        {idx < 0 ? "Setup complete" : `Step ${idx + 1} of ${NUMBERED.length}`}
      </span>
    </div>
  );
}

/* ---- Step 1: Welcome ---- */
function StepWelcome({ name, onNext, onSkip }: { name: string; onNext: () => void; onSkip: () => void }) {
  return (
    <div key="welcome" className="motion-safe:animate-[ob-rise_0.5s_var(--ease)_both]">
      <Progress step="welcome" />
      <span className="inline-flex items-center gap-[8px] text-[12px] font-[550] tracking-[0.06em] uppercase text-link mb-[14px]">
        <span style={{ fontFamily: "'Noto Serif JP', serif" }} className="text-[14px] tracking-normal normal-case opacity-85">淵</span>
        {" "}Welcome
      </span>
      <h1 className="text-[28px] font-semibold tracking-[-0.022em] leading-[1.18] m-0 mb-[10px] [text-wrap:pretty] max-sm:text-[24px]">
        {name ? `Welcome to Fuchine, ${name}.` : "Welcome to Fuchine."}
      </h1>
      <p className="text-[15px] leading-[1.6] text-muted m-0 [text-wrap:pretty]">
        Learn Japanese by watching real videos — with{" "}
        <span className="text-fg font-medium">smart dual subtitles</span> that translate and explain,
        line by line, as you watch.
      </p>

      {/* demo card */}
      <div className="mt-[28px] bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow)] px-[22px] pt-[20px] pb-[18px] relative overflow-hidden">
        <div className="flex items-center gap-[7px] text-[11px] font-medium tracking-[0.04em] text-faint mb-[16px]">
          <span className="inline-grid place-items-center text-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M7 11.5h2.5M7 14.5h4" />
              <path d="M13.5 11.5H17M13.5 14.5h2" />
            </svg>
          </span>
          <span>Dual subtitles</span>
          <span className="flex-1" />
          <span className="tabular-nums">02:14</span>
        </div>
        <div className="text-[19px] leading-[1.7] tracking-[0.01em] text-fg mb-[7px]">
          水の<b className="font-medium text-accent border-b-2 border-accent-line pb-[1px]">淵</b>に、静かに沈んでいく。
        </div>
        <div className="text-[13.5px] leading-[1.5] text-muted">Sinking quietly into the depths of the water.</div>
        <div className="flex gap-[5px] mt-[16px]">
          <i className="not-italic h-[3px] rounded-[3px] bg-border-strong flex-1" />
          <i className="not-italic h-[3px] rounded-[3px] bg-accent opacity-85 flex-[0_0_34px]" />
          <i className="not-italic h-[3px] rounded-[3px] bg-border-strong flex-1" />
          <i className="not-italic h-[3px] rounded-[3px] bg-border-strong flex-1" />
        </div>
      </div>

      <div className="mt-[30px]">
        <button
          className="w-full h-[47px] text-[14.5px] font-[550] tracking-[0.005em] rounded-[var(--radius)] cursor-pointer flex items-center justify-content-center gap-[9px] justify-center transition-[background] duration-[0.18s] ease-[var(--ease)] text-on-accent bg-accent border-none hover:bg-accent-hover active:bg-accent-press active:[transform:translateY(0.5px)] [&_svg]:w-[17px] [&_svg]:h-[17px]"
          onClick={onNext}
        >
          Get started <ArrowIcon />
        </button>
        <div className="flex items-center justify-center gap-[8px] mt-[16px]">
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onSkip}
          >
            Skip setup
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Step 2: Language ---- */
function StepLanguage({
  value, onChange, onNext, onBack, onSkip,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div key="language" className="motion-safe:animate-[ob-rise_0.5s_var(--ease)_both]">
      <Progress step="language" />
      <span className="inline-flex items-center gap-[8px] text-[12px] font-[550] tracking-[0.06em] uppercase text-link mb-[14px]">
        Explanations
      </span>
      <h1 className="text-[28px] font-semibold tracking-[-0.022em] leading-[1.18] m-0 mb-[10px] [text-wrap:pretty] max-sm:text-[24px]">
        Which language should Fuchine explain in?
      </h1>
      <p className="text-[15px] leading-[1.6] text-muted m-0 [text-wrap:pretty]">
        Translations and AI explanations will appear in this language — it&apos;s how
        Fuchine explains things <span className="text-fg font-medium">to you</span>. Change it anytime in
        Settings.
      </p>

      <div className="grid gap-[8px] mt-[26px]" role="radiogroup" aria-label="Explanation language">
        {LANGS.map((l) => {
          const isOn = value === l.v;
          return (
            <button
              key={l.v}
              role="radio"
              aria-checked={isOn}
              className={[
                "flex items-center gap-[14px] w-full text-left px-[16px] py-[13px]",
                "border rounded-[var(--radius)] cursor-pointer font-[inherit]",
                "transition-[border-color,background,box-shadow] duration-[0.16s] ease-[var(--ease)]",
                isOn
                  ? "border-accent bg-accent-soft shadow-[0_0_0_3px_var(--accent-ring)]"
                  : "border-border-strong bg-surface hover:border-faint",
              ].join(" ")}
              onClick={() => onChange(l.v)}
            >
              <span
                className={[
                  "w-[18px] h-[18px] rounded-full border-[1.6px] flex-none grid place-items-center",
                  "transition-[border-color] duration-[0.16s] ease-[var(--ease)]",
                  isOn ? "border-accent" : "border-border-strong",
                ].join(" ")}
              >
                <i
                  className={[
                    "not-italic w-[9px] h-[9px] rounded-full bg-accent",
                    "transition-transform duration-[0.18s] ease-[var(--ease)]",
                    isOn ? "scale-100" : "scale-0",
                  ].join(" ")}
                />
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="block text-[14.5px] font-medium text-fg">{l.name}</span>
                {l.native !== l.name && (
                  <span className="block text-[12.5px] text-faint mt-[2px]">{l.native}</span>
                )}
              </span>
              {l.flag && <span className="text-[12px] text-faint">{l.flag}</span>}
            </button>
          );
        })}
      </div>

      {/* studying-fixed pill */}
      <div className="flex items-center gap-[11px] mt-[18px] px-[15px] py-[11px] bg-bg-2 border border-border rounded-[var(--radius)] text-[13px] text-muted">
        <span className="text-faint flex-none [&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:block">
          <LockIcon />
        </span>
        <span className="flex-1">
          You&apos;re learning{" "}
          <span className="font-semibold text-fg whitespace-nowrap">日本語 · Japanese</span>
        </span>
        <span className="text-[11px] tracking-[0.04em] text-faint whitespace-nowrap">FIXED FOR NOW</span>
      </div>

      <div className="mt-[30px]">
        <button
          className="w-full h-[47px] text-[14.5px] font-[550] tracking-[0.005em] rounded-[var(--radius)] cursor-pointer flex items-center justify-center gap-[9px] transition-[background] duration-[0.18s] ease-[var(--ease)] text-on-accent bg-accent border-none hover:bg-accent-hover active:bg-accent-press active:[transform:translateY(0.5px)] [&_svg]:w-[17px] [&_svg]:h-[17px]"
          onClick={onNext}
        >
          Continue <ArrowIcon />
        </button>
        <div className="flex items-center justify-center gap-[8px] mt-[16px]">
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onBack}
          >
            Back
          </button>
          <span className="w-[3px] h-[3px] rounded-full bg-faint opacity-60" />
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- shared stepper (matches Settings) ---- */
function Stepper({
  value, min, max, onChange, label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const bump = (dir: 1 | -1) => onChange(Math.min(max, Math.max(min, value + dir)));
  return (
    <div className="flex items-center gap-0 rounded-[8px] border border-border-strong bg-surface">
      <button
        type="button"
        className="grid h-[38px] w-[38px] place-items-center text-[18px] text-faint hover:text-fg disabled:opacity-40"
        aria-label={`decrease ${label}`}
        disabled={value <= min}
        onClick={() => bump(-1)}
      >
        −
      </button>
      <span className="w-[52px] text-center text-[14.5px] tabular-nums text-fg">{value}</span>
      <button
        type="button"
        className="grid h-[38px] w-[38px] place-items-center text-[18px] text-faint hover:text-fg disabled:opacity-40"
        aria-label={`increase ${label}`}
        disabled={value >= max}
        onClick={() => bump(1)}
      >
        +
      </button>
    </div>
  );
}

/* ---- Step 3: Daily goals ---- */
function StepGoals({
  newCards, onNewCards, watchMin, onWatchMin, onNext, onBack, onSkip,
}: {
  newCards: number;
  onNewCards: (v: number) => void;
  watchMin: number;
  onWatchMin: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div key="goals" className="motion-safe:animate-[ob-rise_0.5s_var(--ease)_both]">
      <Progress step="goals" />
      <span className="inline-flex items-center gap-[8px] text-[12px] font-[550] tracking-[0.06em] uppercase text-link mb-[14px]">
        Daily goals
      </span>
      <h1 className="text-[28px] font-semibold tracking-[-0.022em] leading-[1.18] m-0 mb-[10px] [text-wrap:pretty] max-sm:text-[24px]">
        Set a gentle daily rhythm
      </h1>
      <p className="text-[15px] leading-[1.6] text-muted m-0 [text-wrap:pretty]">
        A small daily target keeps a streak alive. Start light — you can{" "}
        <span className="text-fg font-medium">change these anytime</span> in Settings.
      </p>

      <div className="grid gap-[8px] mt-[26px]">
        <div className="flex items-center gap-[14px] w-full px-[16px] py-[13px] border border-border-strong rounded-[var(--radius)] bg-surface">
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="block text-[14.5px] font-medium text-fg">New cards per day</span>
            <span className="block text-[12.5px] text-faint mt-[2px]">
              Freshly mined words to introduce daily
            </span>
          </span>
          <Stepper value={newCards} min={1} max={500} onChange={onNewCards} label="new cards per day" />
        </div>

        <div className="flex items-center gap-[14px] w-full px-[16px] py-[13px] border border-border-strong rounded-[var(--radius)] bg-surface">
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="block text-[14.5px] font-medium text-fg">Watch time per day</span>
            <span className="block text-[12.5px] text-faint mt-[2px]">
              Minutes of immersion to aim for
            </span>
          </span>
          <Stepper value={watchMin} min={1} max={1440} onChange={onWatchMin} label="watch minutes per day" />
        </div>
      </div>

      <div className="mt-[30px]">
        <button
          className="w-full h-[47px] text-[14.5px] font-[550] tracking-[0.005em] rounded-[var(--radius)] cursor-pointer flex items-center justify-center gap-[9px] transition-[background] duration-[0.18s] ease-[var(--ease)] text-on-accent bg-accent border-none hover:bg-accent-hover active:bg-accent-press active:[transform:translateY(0.5px)] [&_svg]:w-[17px] [&_svg]:h-[17px]"
          onClick={onNext}
        >
          Continue <ArrowIcon />
        </button>
        <div className="flex items-center justify-center gap-[8px] mt-[16px]">
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onBack}
          >
            Back
          </button>
          <span className="w-[3px] h-[3px] rounded-full bg-faint opacity-60" />
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Step 4: API Key ---- */
function StepKey({
  provider, onProvider, keyVal, onKey, onFinish, onBack, onSkip,
}: {
  provider: string;
  onProvider: (v: string) => void;
  keyVal: string;
  onKey: (v: string) => void;
  onFinish: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [show, setShow] = useState(false);
  const prov = PROVIDERS.find((p) => p.v === provider) ?? PROVIDERS[0]!;
  const isLocal = provider === "local";

  return (
    <div key="key" className="motion-safe:animate-[ob-rise_0.5s_var(--ease)_both]">
      <Progress step="key" />
      <span className="inline-flex items-center gap-[8px] text-[12px] font-[550] tracking-[0.06em] uppercase text-link mb-[14px]">
        AI key · Optional
      </span>
      <h1 className="text-[28px] font-semibold tracking-[-0.022em] leading-[1.18] m-0 mb-[10px] [text-wrap:pretty] max-sm:text-[24px]">
        Bring your own AI key
      </h1>
      <p className="text-[15px] leading-[1.6] text-muted m-0 [text-wrap:pretty]">
        Paste a key to switch on AI translation and explanations. Fuchine self-hosts
        your key — it&apos;s <span className="text-fg font-medium">encrypted at rest</span>, never
        shared, never logged.
      </p>

      {/* provider segmented control */}
      <div
        className="grid grid-cols-4 gap-[2px] bg-bg-2 border border-border rounded-[11px] p-[3px] mt-[24px] mb-[16px] max-sm:grid-cols-2"
        role="tablist"
        aria-label="Provider"
      >
        {PROVIDERS.map((p) => {
          const isOn = provider === p.v;
          return (
            <button
              key={p.v}
              role="tab"
              aria-selected={isOn}
              className={[
                "border-none px-[4px] py-[8px] rounded-[8px] font-[inherit] text-[13px] font-[550] cursor-pointer",
                "transition-[background,color] duration-[0.14s] ease-[var(--ease)]",
                isOn
                  ? "bg-surface text-fg shadow-[var(--shadow-sm)]"
                  : "bg-transparent text-muted hover:text-fg",
              ].join(" ")}
              onClick={() => onProvider(p.v)}
            >
              {p.l}
            </button>
          );
        })}
      </div>

      {/* key row label */}
      <div className="flex items-baseline justify-between mb-[8px]">
        <span className="text-[12.5px] font-medium text-muted tracking-[0.005em]">
          {isLocal ? "Endpoint" : "API key"}
        </span>
        <button
          className="bg-none border-none p-0 font-[inherit] text-[12.5px] font-medium text-link cursor-pointer hover:text-link-hover hover:underline hover:[text-underline-offset:3px]"
          type="button"
          onClick={() => {}}
        >
          How to get a key
        </button>
      </div>

      {/* key input */}
      <div className="relative flex items-center">
        <input
          className={[
            "w-full h-[47px] pr-[46px] pl-[15px] font-[inherit] text-[14px] tracking-[0.02em] text-fg",
            "bg-[var(--field-bg,var(--surface))] border border-border-strong rounded-[var(--radius)] outline-none",
            "transition-[border-color,box-shadow] duration-[0.18s] ease-[var(--ease)]",
            "placeholder:text-faint placeholder:tracking-normal",
            "hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]",
          ].join(" ")}
          type={show || isLocal ? "text" : "password"}
          placeholder={prov.ph}
          value={keyVal}
          onChange={(e) => onKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {!isLocal && (
          <button
            className={[
              "absolute right-[8px] w-[32px] h-[32px] grid place-items-center bg-none border-none text-faint cursor-pointer rounded-[7px]",
              "transition-[color,background] duration-[0.15s] ease-[var(--ease)]",
              "hover:text-muted hover:bg-bg-2",
              "[&_svg]:w-[18px] [&_svg]:h-[18px]",
            ].join(" ")}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide key" : "Show key"}
            type="button"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>

      {/* secure note */}
      <div className="flex items-start gap-[9px] mt-[14px] text-[12.5px] leading-[1.5] text-muted">
        <span className="flex-none text-ok mt-[1px] [&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:block">
          <LockIcon />
        </span>
        <span>Stored encrypted on your account. You can rotate or remove it anytime in Settings.</span>
      </div>

      {/* info note */}
      <div className="flex gap-[11px] mt-[20px] px-[16px] py-[14px] bg-accent-soft border border-accent-line rounded-[var(--radius)]">
        <span className="flex-none text-accent mt-[1px] [&_svg]:w-[17px] [&_svg]:h-[17px] [&_svg]:block">
          <InfoIcon />
        </span>
        <p className="m-0 text-[12.8px] leading-[1.5] text-muted">
          <span className="text-fg font-[550]">No key? You&apos;re still set.</span> Dictionary lookups
          and sentence tokenization work fully without one. Turn on AI translation later
          in Settings.
        </p>
      </div>

      <div className="mt-[30px]">
        <button
          className="w-full h-[47px] text-[14.5px] font-[550] tracking-[0.005em] rounded-[var(--radius)] cursor-pointer flex items-center justify-center gap-[9px] transition-[background] duration-[0.18s] ease-[var(--ease)] text-on-accent bg-accent border-none hover:bg-accent-hover active:bg-accent-press active:[transform:translateY(0.5px)] [&_svg]:w-[17px] [&_svg]:h-[17px]"
          onClick={onFinish}
        >
          {keyVal.trim() ? "Save & finish" : "Finish"} <CheckIcon />
        </button>
        <div className="flex items-center justify-center gap-[8px] mt-[16px]">
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onBack}
          >
            Back
          </button>
          <span className="w-[3px] h-[3px] rounded-full bg-faint opacity-60" />
          <button
            className="bg-none border-none px-[8px] py-[6px] text-[13.5px] font-medium text-muted cursor-pointer rounded-[7px] transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-fg"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Step 4: Done ---- */
function StepDone({ onEnter }: { onEnter: () => void }) {
  return (
    <div key="done" className="motion-safe:animate-[ob-rise_0.5s_var(--ease)_both] text-center flex flex-col items-center">
      <Progress step="done" />
      <div className="w-[64px] h-[64px] rounded-full bg-accent-soft border border-accent-line grid place-items-center text-accent mb-[26px] [&_svg]:w-[30px] [&_svg]:h-[30px]">
        <CheckIcon />
      </div>
      <h1 className="text-[28px] font-semibold tracking-[-0.022em] leading-[1.18] m-0 mb-[12px] [text-wrap:pretty] max-sm:text-[24px]">
        You&apos;re all set.
      </h1>
      <p className="text-[15px] leading-[1.6] text-muted m-0 [text-wrap:pretty] max-w-[30ch]">
        Your space is ready. Dive in whenever you are — everything else can be tuned
        later in Settings.
      </p>
      <div className="mt-[30px] w-full max-w-[300px]">
        <button
          className="w-full h-[47px] text-[14.5px] font-[550] tracking-[0.005em] rounded-[var(--radius)] cursor-pointer flex items-center justify-center gap-[9px] transition-[background] duration-[0.18s] ease-[var(--ease)] text-on-accent bg-accent border-none hover:bg-accent-hover active:bg-accent-press active:[transform:translateY(0.5px)] [&_svg]:w-[17px] [&_svg]:h-[17px]"
          onClick={onEnter}
        >
          Enter Fuchine <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

/* ---- Main export ---- */
export function OnboardingView({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [lang, setLang] = useState("en");
  const [newCards, setNewCards] = useState(DEFAULT_NEW_CARDS);
  const [watchMin, setWatchMin] = useState(DEFAULT_WATCH_MIN);
  const [goalsSet, setGoalsSet] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [keyVal, setKeyVal] = useState("");
  const [saving, setSaving] = useState(false);

  const go = (s: Step) => setStep(s);

  const enter = () => router.replace("/");

  // Body shared by finish/skip: language always, goals once the user has passed
  // the goals step (skipping before it leaves goals untouched), key on finish.
  const baseBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = { explanationLanguage: lang };
    if (goalsSet) {
      body.dailyGoals = { newCardsPerDay: newCards, watchMinutesPerDay: watchMin };
    }
    return body;
  };

  const post = (body: Record<string, unknown>) =>
    fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const body = baseBody();
    if (keyVal.trim()) {
      body.llmProvider = provider;
      body.apiKey = keyVal;
    }
    try {
      await post(body);
    } finally {
      setSaving(false);
      go("done");
    }
  };

  const skip = async () => {
    // Mark done even when skipping, so the user isn't looped back.
    await post(baseBody());
    enter();
  };

  return (
    <div className="relative min-h-dvh flex flex-col bg-bg overflow-hidden">
      {/* watermark */}
      <div
        aria-hidden="true"
        className="absolute right-[-0.10em] bottom-[-0.24em] text-[52vh] leading-[1] text-accent opacity-[0.04] pointer-events-none select-none z-0"
        style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 400 }}
      >
        淵
      </div>

      {/* top bar */}
      <header className="relative z-[2] flex items-center justify-between px-[40px] py-[28px] flex-none max-sm:px-[22px]">
        <div className="flex items-center gap-[9px] text-[15px] font-semibold tracking-[-0.01em] text-fg">
          <span
            className="w-[22px] h-[22px] rounded-[6px] bg-accent text-on-accent grid place-items-center text-[13px] font-medium pb-[1px]"
            style={{ fontFamily: "'Noto Serif JP', serif" }}
          >
            淵
          </span>
          <span>Fuchine</span>
        </div>
        {step !== "done" && (
          <button
            className="bg-none border-none px-[2px] py-[6px] font-[inherit] text-[13px] font-medium text-faint cursor-pointer transition-[color] duration-[0.16s] ease-[var(--ease)] hover:text-muted"
            onClick={skip}
            title="You can finish setup later in Settings"
          >
            Set up later
          </button>
        )}
      </header>

      {/* centered stage */}
      <main className="relative z-[1] flex-1 flex flex-col items-center justify-center px-[24px] pt-[12px] pb-[72px] min-h-0">
        <div className="w-full max-w-[452px]">
          {step === "welcome" && (
            <StepWelcome name={name} onNext={() => go("language")} onSkip={skip} />
          )}
          {step === "language" && (
            <StepLanguage
              value={lang}
              onChange={setLang}
              onNext={() => go("goals")}
              onBack={() => go("welcome")}
              onSkip={skip}
            />
          )}
          {step === "goals" && (
            <StepGoals
              newCards={newCards}
              onNewCards={setNewCards}
              watchMin={watchMin}
              onWatchMin={setWatchMin}
              onNext={() => { setGoalsSet(true); go("key"); }}
              onBack={() => go("language")}
              onSkip={skip}
            />
          )}
          {step === "key" && (
            <StepKey
              provider={provider}
              onProvider={setProvider}
              keyVal={keyVal}
              onKey={setKeyVal}
              onFinish={finish}
              onBack={() => go("goals")}
              onSkip={skip}
            />
          )}
          {step === "done" && <StepDone onEnter={enter} />}

          {step !== "done" && (
            <div className="mt-[22px] flex items-center justify-center gap-[7px] text-[12.5px] text-faint text-center [&_svg]:w-[14px] [&_svg]:h-[14px] [&_svg]:flex-none">
              <LockIcon />
              You can skip any step and finish setup later in Settings.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
