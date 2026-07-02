"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const TABLES: Record<string, [string, string, string][]> = {
  monograph: [
    ["a", "あ", "ア"], ["i", "い", "イ"], ["u", "う", "ウ"], ["e", "え", "エ"], ["o", "お", "オ"],
    ["ka", "か", "カ"], ["ki", "き", "キ"], ["ku", "く", "ク"], ["ke", "け", "ケ"], ["ko", "こ", "コ"],
    ["sa", "さ", "サ"], ["shi", "し", "シ"], ["su", "す", "ス"], ["se", "せ", "セ"], ["so", "そ", "ソ"],
    ["ta", "た", "タ"], ["chi", "ち", "チ"], ["tsu", "つ", "ツ"], ["te", "て", "テ"], ["to", "と", "ト"],
    ["na", "な", "ナ"], ["ni", "に", "ニ"], ["nu", "ぬ", "ヌ"], ["ne", "ね", "ネ"], ["no", "の", "ノ"],
    ["ha", "は", "ハ"], ["hi", "ひ", "ヒ"], ["fu", "ふ", "フ"], ["he", "へ", "ヘ"], ["ho", "ほ", "ホ"],
    ["ma", "ま", "マ"], ["mi", "み", "ミ"], ["mu", "む", "ム"], ["me", "め", "メ"], ["mo", "も", "モ"],
    ["ya", "や", "ヤ"], ["yu", "ゆ", "ユ"], ["yo", "よ", "ヨ"],
    ["ra", "ら", "ラ"], ["ri", "り", "リ"], ["ru", "る", "ル"], ["re", "れ", "レ"], ["ro", "ろ", "ロ"],
    ["wa", "わ", "ワ"], ["wo", "を", "ヲ"], ["n", "ん", "ン"],
  ],
  dakuten: [
    ["ga", "が", "ガ"], ["gi", "ぎ", "ギ"], ["gu", "ぐ", "グ"], ["ge", "げ", "ゲ"], ["go", "ご", "ゴ"],
    ["za", "ざ", "ザ"], ["ji", "じ", "ジ"], ["zu", "ず", "ズ"], ["ze", "ぜ", "ゼ"], ["zo", "ぞ", "ゾ"],
    ["da", "だ", "ダ"], ["de", "で", "デ"], ["do", "ど", "ド"],
    ["ba", "ば", "バ"], ["bi", "び", "ビ"], ["bu", "ぶ", "ブ"], ["be", "べ", "ベ"], ["bo", "ぼ", "ボ"],
    ["pa", "ぱ", "パ"], ["pi", "ぴ", "ピ"], ["pu", "ぷ", "プ"], ["pe", "ぺ", "ペ"], ["po", "ぽ", "ポ"],
  ],
  digraph: [
    ["kya", "きゃ", "キャ"], ["kyu", "きゅ", "キュ"], ["kyo", "きょ", "キョ"],
    ["sha", "しゃ", "シャ"], ["shu", "しゅ", "シュ"], ["sho", "しょ", "ショ"],
    ["cha", "ちゃ", "チャ"], ["chu", "ちゅ", "チュ"], ["cho", "ちょ", "チョ"],
    ["nya", "にゃ", "ニャ"], ["nyu", "にゅ", "ニュ"], ["nyo", "にょ", "ニョ"],
    ["hya", "ひゃ", "ヒャ"], ["hyu", "ひゅ", "ヒュ"], ["hyo", "ひょ", "ヒョ"],
    ["mya", "みゃ", "ミャ"], ["myu", "みゅ", "ミュ"], ["myo", "みょ", "ミョ"],
    ["rya", "りゃ", "リャ"], ["ryu", "りゅ", "リュ"], ["ryo", "りょ", "リョ"],
  ],
  "digraph-dakuten": [
    ["gya", "ぎゃ", "ギャ"], ["gyu", "ぎゅ", "ギュ"], ["gyo", "ぎょ", "ギョ"],
    ["ja", "じゃ", "ジャ"], ["ju", "じゅ", "ジュ"], ["jo", "じょ", "ジョ"],
    ["bya", "びゃ", "ビャ"], ["byu", "びゅ", "ビュ"], ["byo", "びょ", "ビョ"],
    ["pya", "ぴゃ", "ピャ"], ["pyu", "ぴゅ", "ピュ"], ["pyo", "ぴょ", "ピョ"],
  ],
};

const GROUP_META = [
  { key: "monograph", label: "Monographs" },
  { key: "dakuten", label: "Dakuten" },
  { key: "digraph", label: "Digraphs" },
  { key: "digraph-dakuten", label: "Digraphs + dakuten" },
];

const TYPE_META = [
  { key: "hiragana" as const, label: "Hiragana", glyph: "あ" },
  { key: "katakana" as const, label: "Katakana", glyph: "ア" },
];

const ALT: Record<string, string[]> = {
  shi: ["si"], chi: ["ti"], tsu: ["tu"], fu: ["hu"], ji: ["zi", "di"], zu: ["du"],
  sha: ["sya"], shu: ["syu"], sho: ["syo"], cha: ["tya"], chu: ["tyu"], cho: ["tyo"],
  ja: ["jya", "zya"], ju: ["jyu", "zyu"], jo: ["jyo", "zyo"], o: ["wo"],
};

type KanaCard = { kana: string; romaji: string; type: string; group: string };
type Direction = "k2r" | "r2k" | "both";
type AnswerMode = "type" | "mc";
type Phase = "setup" | "quiz" | "summary";
type Feedback = "none" | "correct" | "wrong";

interface MissEntry { card: KanaCard; n: number }

const KANA: KanaCard[] = [];
for (const [group, rows] of Object.entries(TABLES)) {
  for (const [romaji, hira, kata] of rows) {
    KANA.push({ kana: hira, romaji, type: "hiragana", group });
    KANA.push({ kana: kata, romaji, type: "katakana", group });
  }
}

const countFor = (type: string, group: string) => TABLES[group].length;
const previewFor = (type: string, group: string) =>
  TABLES[group].slice(0, 3).map((r: [string, string, string]) => type === "hiragana" ? r[1] : r[2]).join(" ");

const matchRomaji = (input: string, romaji: string): boolean => {
  const v = input.trim().toLowerCase();
  if (v === romaji) return true;
  return (ALT[romaji] || []).includes(v);
};

const shuffle = <T,>(a: T[]): T[] => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

/* ============================================================
   SVG Icons
   ============================================================ */
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

const FlameIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.4c2.8 3.1 5 5.3 5 8.7a5 5 0 0 1-10 0c0-1.4.5-2.5 1.4-3.4.2 1.1.9 1.8 1.9 2C9.3 8.4 10.3 6 12 3.4Z" />
  </svg>
);

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />
  </svg>
);

const MedalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="14.5" r="5" />
    <path d="M12 12.3v0M12 17v0" />
    <path d="M9 9.5 6.5 3.5M15 9.5 17.5 3.5" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* ============================================================
   Components
   ============================================================ */
function SegmentedToggle({ value, options, onChange, accent }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  accent?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={[
        "inline-flex w-full gap-0.5 p-1 rounded-[13px]",
        "border border-border",
        accent ? "bg-bg-2" : "bg-bg-2",
      ].join(" ")}
    >
      {options.map((o) => {
        const isOn = value === o.value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={isOn}
            onClick={() => onChange(o.value)}
            className={[
              "flex-1 border-none text-[13.5px] font-semibold px-3 py-2.5 rounded-[10px] cursor-pointer whitespace-nowrap",
              "transition-[color,background,box-shadow,transform] duration-[180ms] ease-[var(--ease)]",
              "active:translate-y-px",
              isOn
                ? accent
                  ? "bg-accent text-on-accent shadow-[0_2px_6px_-1px_var(--accent-ring)]"
                  : "bg-surface text-fg shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--border)]"
                : "bg-transparent text-muted hover:text-fg",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function KanaGroupSelector({ selection, onChange }: {
  selection: Record<string, boolean>;
  onChange: (s: Record<string, boolean>) => void;
}) {
  const isOn = (type: string, group: string) => !!selection[type + "-" + group];
  const setCol = (type: string, on: boolean) => {
    const next = { ...selection };
    for (const g of GROUP_META) next[type + "-" + g.key] = on;
    onChange(next);
  };
  const toggle = (type: string, group: string) => {
    const k = type + "-" + group;
    onChange({ ...selection, [k]: !selection[k] });
  };
  return (
    <div className="grid grid-cols-2 gap-[14px] max-sm:grid-cols-1">
      {TYPE_META.map((tm) => (
        <div
          key={tm.key}
          className="border border-border rounded-[var(--radius-lg)] bg-surface px-3 pt-3.5 pb-2.5"
        >
          {/* Column header */}
          <div className="flex items-center gap-2.5 px-1.5 pb-3 mb-1 border-b border-border">
            <span
              className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-accent-soft text-link grid place-items-center text-[19px] font-medium"
              style={{ fontFamily: "'Noto Serif JP', serif" }}
            >
              {tm.glyph}
            </span>
            <span className="text-[13.5px] font-semibold text-fg flex-1">{tm.label}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCol(tm.key, true)}
                className="border-none bg-transparent text-[11.5px] font-semibold text-link cursor-pointer p-0 hover:underline"
              >
                All
              </button>
              <span className="text-border-strong text-[10px]">·</span>
              <button
                onClick={() => setCol(tm.key, false)}
                className="border-none bg-transparent text-[11.5px] font-semibold text-link cursor-pointer p-0 hover:underline"
              >
                None
              </button>
            </div>
          </div>

          {/* Group rows */}
          {GROUP_META.map((g) => {
            const on = isOn(tm.key, g.key);
            return (
              <button
                key={g.key}
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(tm.key, g.key)}
                className={[
                  "flex items-center gap-[11px] w-full px-2 py-2.5 rounded-[10px] border text-left cursor-pointer",
                  "transition-[background,border-color] duration-[150ms] ease-[var(--ease)]",
                  on
                    ? "bg-accent-soft border-accent-line"
                    : "bg-transparent border-transparent hover:bg-bg-2",
                ].join(" ")}
              >
                {/* Checkbox box */}
                <span
                  className={[
                    "shrink-0 w-5 h-5 rounded-[6px] grid place-items-center text-on-accent",
                    "transition-[background,border-color,transform] duration-[140ms] ease-[var(--ease)]",
                    on
                      ? "bg-accent border-[1.6px] border-accent"
                      : "bg-[var(--field-bg)] border-[1.6px] border-border-strong",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "w-[13px] h-[13px] transition-[opacity,transform] duration-[140ms] ease-[var(--ease)]",
                      on ? "opacity-100 scale-100" : "opacity-0 scale-[0.6]",
                    ].join(" ")}
                  >
                    <CheckIcon />
                  </span>
                </span>

                {/* Label + preview */}
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-[550] text-fg">{g.label}</span>
                  <span
                    className={[
                      "text-[14px] tracking-[0.12em] leading-none",
                      on ? "text-link" : "text-faint",
                    ].join(" ")}
                    style={{ fontFamily: "'Noto Serif JP', serif" }}
                  >
                    {previewFor(tm.key, g.key)}
                  </span>
                </span>

                {/* Count */}
                <span className="text-[12px] font-semibold text-faint tabular-nums">
                  {countFor(tm.key, g.key)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function KanaPrompt({ card, dir, anim }: { card: KanaCard; dir: Direction; anim: string }) {
  const showKana = dir === "k2r";

  const animClass =
    anim === "enter"
      ? "motion-safe:animate-[kn-charin_0.32s_var(--ease)]"
      : anim === "pop"
      ? "motion-safe:animate-[kn-pop_0.42s_var(--ease)]"
      : "motion-safe:animate-[kn-shake_0.4s_var(--ease)]";

  return (
    <>
      <div className="relative text-[12px] font-semibold tracking-[0.07em] uppercase text-faint mb-[18px]">
        {showKana ? "What is the reading?" : "Which kana is this?"}
      </div>
      <div
        key={card.kana + "-" + anim}
        className={[
          "relative leading-none text-fg",
          showKana
            ? "text-[132px] font-normal max-sm:text-[100px]"
            : "text-[88px] font-medium tracking-[0.01em] max-sm:text-[66px]",
          animClass,
        ].join(" ")}
        style={showKana ? { fontFamily: "'Noto Serif JP', serif" } : undefined}
      >
        {showKana ? card.kana : card.romaji}
      </div>
    </>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 25.5, c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <div className="relative w-14 h-14 shrink-0" title={done + " of " + total}>
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle
          cx="28" cy="28" r={r}
          className="fill-none stroke-accent-soft-2"
          strokeWidth="5"
        />
        <circle
          cx="28" cy="28" r={r}
          className="fill-none stroke-accent stroke-linecap-round transition-[stroke-dashoffset] duration-[400ms] ease-[var(--ease)]"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[14px] font-bold text-fg leading-none tabular-nums">{done}</span>
        <span className="text-[10px] text-faint tabular-nums">/ {total}</span>
      </div>
    </div>
  );
}

/* ============================================================
   KanaView
   ============================================================ */
export function KanaView() {
  const [direction, setDirection] = useState<Direction>("k2r");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("type");
  const [selection, setSelection] = useState<Record<string, boolean>>({ "hiragana-monograph": true });

  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<KanaCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, streak: 0 });
  const [feedback, setFeedback] = useState<Feedback>("none");
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [misses, setMisses] = useState<Record<string, MissEntry>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pool = useMemo(() => KANA.filter((k) => selection[k.type + "-" + k.group]), [selection]);
  const selCount = pool.length;

  const resolveDir = useCallback(
    () => direction === "both" ? (Math.random() < 0.5 ? "k2r" : "r2k") as Direction : direction,
    [direction],
  );

  const start = () => {
    if (selCount === 0) return;
    const q = shuffle(pool);
    setQueue(q);
    setDirs(q.map(() => resolveDir()));
    setIdx(0);
    setStats({ correct: 0, wrong: 0, streak: 0 });
    setMisses({});
    setFeedback("none");
    setTyped("");
    setPicked(null);
    setPhase("quiz");
  };

  const goNext = useCallback(() => {
    setFeedback("none");
    setTyped("");
    setPicked(null);
    setIdx((i) => {
      const ni = i + 1;
      if (ni >= queue.length) {
        setPhase("summary");
        return i;
      }
      return ni;
    });
  }, [queue.length]);

  const card = queue[idx];
  const curDir = dirs[idx] || direction;

  const submit = useCallback((value: string) => {
    if (!card || feedback !== "none") return;
    const ok = matchRomaji(value, card.romaji);
    if (ok) {
      setStats((s) => ({ ...s, correct: s.correct + 1, streak: s.streak + 1 }));
      setFeedback("correct");
      advanceTimer.current = setTimeout(goNext, 620);
    } else {
      setStats((s) => ({ ...s, wrong: s.wrong + 1, streak: 0 }));
      setMisses((m) => {
        const k = card.kana;
        const prev = m[k] || { card, n: 0 };
        return { ...m, [k]: { card, n: prev.n + 1 } };
      });
      setFeedback("wrong");
    }
  }, [card, feedback, goNext]);

  const choices = useMemo(() => {
    if (answerMode !== "mc" || !card) return [];
    const showKana = curDir === "k2r";
    const correct = showKana ? card.romaji : card.kana;
    const seen = new Set([correct]);
    const distract: string[] = [];
    for (const c of shuffle(pool)) {
      const val = showKana ? c.romaji : c.kana;
      if (seen.has(val)) continue;
      seen.add(val);
      distract.push(val);
      if (distract.length === 3) break;
    }
    if (distract.length < 3) {
      for (const c of shuffle(KANA)) {
        const val = showKana ? c.romaji : (c.type === card.type ? c.kana : null);
        if (!val || seen.has(val)) continue;
        seen.add(val);
        distract.push(val);
        if (distract.length === 3) break;
      }
    }
    return shuffle([correct, ...distract]).map((v) => ({ v, correct: v === correct }));
  }, [answerMode, card, curDir, pool, idx]);

  const pickChoice = (opt: { v: string; correct: boolean }, i: number) => {
    if (feedback !== "none") return;
    setPicked(i);
    const romaji = curDir === "k2r" ? opt.v : (KANA.find((k) => k.kana === opt.v)?.romaji || (opt.correct ? card!.romaji : "__"));
    submit(romaji);
  };

  useEffect(() => {
    if (phase === "quiz" && answerMode === "type" && feedback === "none" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, answerMode, feedback, idx]);

  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (e: KeyboardEvent) => {
      if (feedback === "wrong" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        goNext();
        return;
      }
      if (feedback !== "none") return;
      if (answerMode === "mc" && /^[1-4]$/.test(e.key)) {
        const i = +e.key - 1;
        if (choices[i]) pickChoice(choices[i], i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answerMode, feedback, choices, goNext]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const endSession = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setPhase("summary");
  };

  const charAnim = feedback === "correct" ? "pop" : feedback === "wrong" ? "shake" : "enter";

  /* Shared button styles */
  const btnBase =
    "inline-flex items-center justify-content-center gap-[9px] h-[50px] px-6 rounded-[13px] text-[15px] font-semibold cursor-pointer border border-transparent " +
    "transition-[background,border-color,color,transform,box-shadow] duration-[160ms] ease-[var(--ease)] " +
    "active:translate-y-px [&_svg]:w-[18px] [&_svg]:h-[18px]";

  const btnPrimary =
    btnBase +
    " bg-accent text-on-accent shadow-[0_6px_18px_-8px_var(--accent-ring)] " +
    "hover:bg-accent-hover hover:shadow-[0_8px_22px_-8px_var(--accent-ring)] " +
    "disabled:bg-bg-2 disabled:text-faint disabled:cursor-not-allowed disabled:border-border disabled:shadow-none disabled:translate-y-0";

  const btnGhost =
    btnBase +
    " bg-surface border-border-strong text-fg " +
    "hover:border-faint hover:bg-bg-2";

  const btnQuiet =
    "inline-flex items-center justify-center gap-[9px] h-[38px] px-[14px] rounded-[10px] text-[13px] font-semibold cursor-pointer border border-transparent bg-transparent text-muted " +
    "transition-[background,color] duration-[160ms] ease-[var(--ease)] " +
    "hover:bg-bg-2 hover:text-fg active:translate-y-px [&_svg]:w-[18px] [&_svg]:h-[18px]";

  return (
    <div className="flex flex-col overflow-hidden min-w-0 h-full">
      <div className="flex-1 overflow-y-auto min-h-0 flex justify-center">

        {/* ---------- SETUP ---------- */}
        {phase === "setup" && (
          <div
            key="setup"
            className="w-full max-w-[700px] px-8 pt-12 pb-20 flex flex-col max-sm:px-[18px] max-sm:pt-7 max-sm:pb-16 motion-safe:animate-[kn-rise_0.4s_var(--ease)]"
          >
            {/* Hero */}
            <div className="text-center mb-2">
              <span className="inline-flex items-center gap-[7px] text-[11.5px] font-semibold tracking-[0.1em] uppercase text-link bg-accent-soft-2 border border-accent-line px-3 py-[5px] rounded-full [&_svg]:w-[14px] [&_svg]:h-[14px]">
                <BoltIcon /> Recall drill
              </span>
              <h1 className="text-[34px] font-semibold tracking-[-0.02em] text-fg mt-4 mb-0">Kana Practice</h1>
              <p className="text-[15px] text-muted mt-2.5 leading-[1.5]">Drill the syllabaries until they&apos;re automatic.</p>
            </div>

            {/* Direction field */}
            <div className="mt-[34px]">
              <div className="text-[11.5px] font-semibold tracking-[0.08em] uppercase text-faint mb-[11px]">Direction</div>
              <SegmentedToggle value={direction} onChange={(v) => setDirection(v as Direction)} accent
                options={[
                  { value: "k2r", label: "Kana → Romaji" },
                  { value: "r2k", label: "Romaji → Kana" },
                  { value: "both", label: "Both" },
                ]} />
            </div>

            {/* Answer mode field */}
            <div className="mt-[34px]">
              <div className="text-[11.5px] font-semibold tracking-[0.08em] uppercase text-faint mb-[11px]">Answer mode</div>
              <SegmentedToggle value={answerMode} onChange={(v) => setAnswerMode(v as AnswerMode)} accent
                options={[{ value: "type", label: "Type" }, { value: "mc", label: "Multiple choice" }]} />
            </div>

            {/* Kana sets field */}
            <div className="mt-[34px]">
              <div className="text-[11.5px] font-semibold tracking-[0.08em] uppercase text-faint mb-[11px]">Kana sets</div>
              <KanaGroupSelector selection={selection} onChange={setSelection} />
              <div className="mt-5 flex items-center justify-center gap-2 text-[13.5px] text-muted">
                <span className="inline-flex items-baseline gap-[5px] bg-bg-2 border border-border rounded-full px-3 py-[5px]">
                  <b className="text-fg font-bold text-[15px] tabular-nums">{selCount}</b> characters
                </span>
                selected for this session
              </div>
            </div>

            {/* Start field */}
            <div className="mt-[34px]">
              <button className={btnPrimary + " w-full h-14 text-[16px]"} disabled={selCount === 0} onClick={start}>
                Start practice <ArrowIcon />
              </button>
              {selCount === 0 && (
                <div className="mt-2 text-center text-[12.5px] text-faint">Pick at least one set to begin.</div>
              )}
            </div>
          </div>
        )}

        {/* ---------- QUIZ ---------- */}
        {phase === "quiz" && card && (
          <div
            key={"quiz-" + idx}
            className="w-full max-w-[600px] px-8 pt-[30px] pb-[70px] flex flex-col max-sm:px-[18px] max-sm:pb-16 motion-safe:animate-[kn-rise_0.4s_var(--ease)]"
          >
            {/* HUD */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-[14px]">
                {/* Streak */}
                <div className={[
                  "inline-flex items-center gap-[9px] h-11 pl-[13px] pr-4 rounded-full border border-border bg-surface",
                  "transition-[background,border-color,box-shadow] duration-[250ms] ease-[var(--ease)]",
                  "[&_svg]:w-[19px] [&_svg]:h-[19px]",
                  stats.streak >= 3
                    ? "bg-[oklch(0.66_0.13_64_/_0.13)] border-[color-mix(in_oklch,oklch(0.66_0.13_64)_32%,transparent)] shadow-[0_0_0_4px_color-mix(in_oklch,oklch(0.66_0.13_64)_9%,transparent)] [&_svg]:text-[oklch(0.66_0.13_64)] [&_.streak-n]:text-[oklch(0.66_0.13_64)]"
                    : "[&_svg]:text-faint",
                  stats.streak >= 6
                    ? "shadow-[0_0_0_4px_color-mix(in_oklch,oklch(0.66_0.13_64)_14%,transparent),0_6px_18px_-8px_oklch(0.66_0.13_64)]"
                    : "",
                  feedback === "correct" ? "motion-safe:animate-[kn-bump_0.42s_var(--ease)]" : "",
                ].join(" ")}>
                  <FlameIcon />
                  <span className="streak-n text-[20px] font-bold text-fg tabular-nums leading-none">{stats.streak}</span>
                  <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-faint">streak</span>
                </div>

                {/* Tally */}
                <div className="flex flex-col gap-[3px]">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted tabular-nums">
                    <i className="w-[7px] h-[7px] rounded-full bg-ok not-italic" />{stats.correct} correct
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted tabular-nums">
                    <i className="w-[7px] h-[7px] rounded-full bg-error not-italic" />{stats.wrong} wrong
                  </span>
                </div>
              </div>

              <ProgressRing done={idx} total={queue.length} />
            </div>

            {/* Stage */}
            <div className={[
              "relative mt-[26px] border rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] px-7 py-[52px] pb-[56px] min-h-[280px]",
              "flex flex-col items-center justify-center overflow-hidden",
              "transition-[background,border-color,box-shadow] duration-[280ms] ease-[var(--ease)]",
              feedback === "correct"
                ? "bg-ok-soft border-[color-mix(in_oklch,var(--ok)_30%,var(--border))] shadow-[0_0_0_4px_color-mix(in_oklch,var(--ok)_10%,transparent)]"
                : feedback === "wrong"
                ? "bg-[color-mix(in_oklch,var(--error)_6%,var(--surface))] border-[color-mix(in_oklch,var(--error)_28%,var(--border))]"
                : "border-border",
            ].join(" ")}>
              {/* Decorative ring */}
              <div className={[
                "absolute top-1/2 left-1/2 w-[230px] h-[230px] -translate-x-1/2 -translate-y-[54%] rounded-full border-[1.5px] border-border opacity-50",
                "transition-[border-color,opacity,transform] duration-[280ms] ease-[var(--ease)]",
                feedback === "correct"
                  ? "border-[color-mix(in_oklch,var(--ok)_40%,transparent)] opacity-90 scale-[1.04] -translate-x-1/2 -translate-y-[54%]"
                  : feedback === "wrong"
                  ? "border-[color-mix(in_oklch,var(--error)_30%,transparent)]"
                  : "",
              ].join(" ")} aria-hidden="true" />

              <KanaPrompt card={card} dir={curDir} anim={charAnim} />

              {/* Reveal on wrong */}
              {feedback === "wrong" && (
                <div className="relative mt-6 flex flex-col items-center gap-1.5 motion-safe:animate-[kn-reveal-in_0.22s_var(--ease)]">
                  <span className="text-[10.5px] font-bold tracking-[0.08em] uppercase text-error">Answer</span>
                  <div className="inline-flex items-baseline gap-[9px]">
                    {curDir === "k2r" ? (
                      <>
                        <span className="text-[28px] font-semibold text-fg">{card.romaji}</span>
                        <span className="text-[15px] text-muted" style={{ fontFamily: "'Noto Serif JP', serif" }}>{card.kana}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[28px] font-normal text-fg" style={{ fontFamily: "'Noto Serif JP', serif" }}>{card.kana}</span>
                        <span className="text-[15px] text-muted">{card.romaji}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Answer area */}
            <div className="mt-[22px]">
              {answerMode === "type" ? (
                <>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      value={typed}
                      placeholder={curDir === "k2r" ? "Type the reading…" : "Type romaji for the kana…"}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (feedback === "wrong") goNext();
                          else if (typed.trim()) submit(typed);
                        }
                      }}
                      autoFocus
                      className={[
                        "w-full h-[60px] text-center border-[1.6px] rounded-[15px] bg-[var(--field-bg)] outline-none",
                        "text-[24px] font-medium text-fg tracking-[0.01em]",
                        "placeholder:text-faint placeholder:text-[17px] placeholder:font-normal placeholder:tracking-normal",
                        "transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease)]",
                        feedback === "correct"
                          ? "border-ok shadow-[0_0_0_3.5px_color-mix(in_oklch,var(--ok)_22%,transparent)]"
                          : feedback === "wrong"
                          ? "border-error shadow-[0_0_0_3.5px_color-mix(in_oklch,var(--error)_20%,transparent)]"
                          : "border-border-strong focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]",
                      ].join(" ")}
                    />
                    {feedback === "none" && (
                      <span className="absolute right-[14px] top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-[11px] text-faint">
                        <kbd className="text-[11px] font-semibold text-muted bg-bg-2 border border-border border-b-2 rounded-[6px] px-[7px] py-0.5 min-w-[22px] text-center">↵</kbd>
                      </span>
                    )}
                  </div>
                  {feedback === "wrong" && (
                    <div className="mt-4">
                      <button className={btnGhost + " w-full"} onClick={goNext}>Continue <ArrowIcon /></button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {choices.map((opt, i) => {
                      const isKana = curDir === "r2k";
                      const isCorrect = feedback !== "none" && opt.correct;
                      const isWrong = feedback !== "none" && !opt.correct && picked === i;
                      const isDim = feedback !== "none" && !opt.correct && picked !== i;
                      return (
                        <button
                          key={i}
                          disabled={feedback !== "none"}
                          onClick={() => pickChoice(opt, i)}
                          className={[
                            "relative h-[76px] rounded-[15px] border font-medium text-[30px] text-fg cursor-pointer",
                            "flex items-center justify-center",
                            "transition-[border-color,background,transform,box-shadow] duration-[140ms] ease-[var(--ease)]",
                            "disabled:cursor-default",
                            isCorrect
                              ? "border-ok bg-ok-soft text-ok motion-safe:animate-[kn-pop_0.4s_var(--ease)]"
                              : isWrong
                              ? "border-error bg-[color-mix(in_oklch,var(--error)_9%,var(--surface))] text-error motion-safe:animate-[kn-shake_0.4s_var(--ease)]"
                              : isDim
                              ? "border-border-strong bg-surface opacity-45"
                              : "border-border-strong bg-surface hover:not-disabled:border-accent hover:not-disabled:bg-accent-soft hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-[var(--shadow-sm)] active:not-disabled:translate-y-0",
                          ].join(" ")}
                        >
                          <span className={[
                            "absolute left-[11px] top-[9px] text-[11px] font-semibold text-faint",
                            "w-[19px] h-[19px] border border-b-2 border-border rounded-[6px] grid place-items-center",
                            isCorrect ? "border-[color-mix(in_oklch,var(--ok)_40%,transparent)] text-ok" : "",
                          ].join(" ")}>
                            {i + 1}
                          </span>
                          <span style={isKana ? { fontFamily: "'Noto Serif JP', serif" } : undefined}>{opt.v}</span>
                        </button>
                      );
                    })}
                  </div>
                  {feedback === "wrong" && (
                    <div className="mt-4">
                      <button className={btnGhost + " w-full"} onClick={goNext}>Continue <ArrowIcon /></button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Legend */}
            <div className="mt-[14px] text-center text-[11.5px] text-faint">
              {answerMode === "mc"
                ? (<><kbd className="text-[10.5px] font-semibold text-muted bg-bg-2 border border-border rounded-[5px] px-1.5 py-px mx-px">1</kbd>–<kbd className="text-[10.5px] font-semibold text-muted bg-bg-2 border border-border rounded-[5px] px-1.5 py-px mx-px">4</kbd> to answer · <kbd className="text-[10.5px] font-semibold text-muted bg-bg-2 border border-border rounded-[5px] px-1.5 py-px mx-px">↵</kbd> to continue</>)
                : (<><kbd className="text-[10.5px] font-semibold text-muted bg-bg-2 border border-border rounded-[5px] px-1.5 py-px mx-px">↵</kbd> to submit</>)
              }
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2 mt-5">
              <button className={btnQuiet} onClick={() => goNext()}>Skip</button>
              <button className={btnQuiet} onClick={() => endSession()}>End session</button>
            </div>
          </div>
        )}

        {/* ---------- SUMMARY ---------- */}
        {phase === "summary" && (() => {
          const liveTough = Object.values(misses).sort((a, b) => b.n - a.n).slice(0, 4);
          const c = stats.correct;
          const w = stats.wrong;
          const acc = (c + w) > 0 ? Math.round((c / (c + w)) * 100) : 0;
          return (
            <div
              key="summary"
              className="w-full max-w-[600px] px-8 pt-12 pb-20 flex flex-col max-sm:px-[18px] motion-safe:animate-[kn-rise_0.4s_var(--ease)]"
            >
              <div className="mt-2 mx-auto max-w-[480px] w-full border border-border rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow)] pb-[30px] text-center overflow-hidden">
                {/* Crown area */}
                <div className="px-[34px] pt-[30px] pb-[26px] bg-gradient-to-b from-accent-soft to-transparent border-b border-border">
                  <div className="w-12 h-12 mx-auto mb-[14px] rounded-[14px] bg-accent text-on-accent grid place-items-center shadow-[0_8px_20px_-8px_var(--accent-ring)] [&_svg]:w-[26px] [&_svg]:h-[26px]">
                    <MedalIcon />
                  </div>
                  <div className="text-[11.5px] font-semibold tracking-[0.07em] uppercase text-link">Session complete</div>
                  <div className="text-[68px] font-bold text-fg leading-[1.02] mt-1.5 tracking-[-0.03em]">
                    {acc}<span className="text-[30px] text-muted font-semibold">%</span>
                  </div>
                  <div className="flex justify-center gap-2.5 mt-4">
                    <span className="inline-flex items-center gap-[7px] text-[13px] text-muted bg-surface border border-border rounded-full px-3 py-[5px]">
                      <i className="w-[7px] h-[7px] rounded-full bg-ok not-italic" /><b className="text-fg font-bold tabular-nums">{c}</b> correct
                    </span>
                    <span className="inline-flex items-center gap-[7px] text-[13px] text-muted bg-surface border border-border rounded-full px-3 py-[5px]">
                      <i className="w-[7px] h-[7px] rounded-full bg-error not-italic" /><b className="text-fg font-bold tabular-nums">{w}</b> wrong
                    </span>
                  </div>
                </div>

                {/* Toughest kana */}
                {liveTough.length > 0 && (
                  <div className="mt-6 px-7 text-left">
                    <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-faint mb-[11px] text-center">Toughest kana</div>
                    <div className="flex flex-col gap-2">
                      {liveTough.map((m, i) => (
                        <div key={i} className="flex items-center gap-[14px] border border-border rounded-[var(--radius)] bg-[var(--field-bg-2)] px-[14px] py-[9px]">
                          <span className="text-[28px] leading-none text-fg" style={{ fontFamily: "'Noto Serif JP', serif" }}>{m.card.kana}</span>
                          <span className="text-[14px] text-muted flex-1">{m.card.romaji}</span>
                          <span className="text-[11.5px] text-error font-semibold bg-[color-mix(in_oklch,var(--error)_9%,transparent)] rounded-full px-[9px] py-[3px]">
                            missed ×{m.n}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2.5 mt-[26px] px-7">
                  <button className={btnPrimary + " flex-1"} onClick={start}>Practice again</button>
                  <button className={btnGhost + " flex-1"} onClick={() => window.location.href = "/"}>Back to library</button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
