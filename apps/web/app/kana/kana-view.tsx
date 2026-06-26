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
    <div className={"segtog" + (accent ? " accent" : "")} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value}
          className={"segtog-b" + (value === o.value ? " on" : "")}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
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
    <div className="kn-groups">
      {TYPE_META.map((tm) => (
        <div key={tm.key} className="kn-gcol">
          <div className="kn-gcol-head">
            <span className="kn-gcol-glyph jp">{tm.glyph}</span>
            <span className="kn-gcol-title">{tm.label}</span>
            <div className="kn-selall">
              <button onClick={() => setCol(tm.key, true)}>All</button>
              <span>·</span>
              <button onClick={() => setCol(tm.key, false)}>None</button>
            </div>
          </div>
          {GROUP_META.map((g) => (
            <button key={g.key} className={"kn-group" + (isOn(tm.key, g.key) ? " on" : "")}
              onClick={() => toggle(tm.key, g.key)} role="checkbox" aria-checked={isOn(tm.key, g.key)}>
              <span className="kn-box"><CheckIcon /></span>
              <span className="kn-group-main">
                <span className="kn-group-label">{g.label}</span>
                <span className="kn-group-preview jp">{previewFor(tm.key, g.key)}</span>
              </span>
              <span className="kn-group-count">{countFor(tm.key, g.key)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function KanaPrompt({ card, dir, anim }: { card: KanaCard; dir: Direction; anim: string }) {
  const showKana = dir === "k2r";
  return (
    <>
      <div className="kn-cue">{showKana ? "What is the reading?" : "Which kana is this?"}</div>
      <div className={"kn-char " + (showKana ? "jp" : "romaji") + " " + anim} key={card.kana + "-" + anim}>
        {showKana ? card.kana : card.romaji}
      </div>
    </>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 25.5, c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <div className="kn-ring" title={done + " of " + total}>
      <svg viewBox="0 0 56 56">
        <circle className="ring-bg" cx="28" cy="28" r={r} />
        <circle className="ring-fg" cx="28" cy="28" r={r}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="kn-ring-mid">
        <span className="kn-ring-done">{done}</span>
        <span className="kn-ring-total">/ {total}</span>
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

  return (
    <div className="kana-main">
      <div className="kana-scroll">

        {/* ---------- SETUP ---------- */}
        {phase === "setup" && (
          <div className="kana-col wide kn-rise" key="setup">
            <div className="kn-hero">
              <span className="kn-eyebrow"><BoltIcon /> Recall drill</span>
              <h1 className="kn-title">Kana Practice</h1>
              <p className="kn-sub">Drill the syllabaries until they&apos;re automatic.</p>
            </div>

            <div className="kn-field">
              <div className="kn-label">Direction</div>
              <SegmentedToggle value={direction} onChange={(v) => setDirection(v as Direction)} accent
                options={[
                  { value: "k2r", label: "Kana → Romaji" },
                  { value: "r2k", label: "Romaji → Kana" },
                  { value: "both", label: "Both" },
                ]} />
            </div>

            <div className="kn-field">
              <div className="kn-label">Answer mode</div>
              <SegmentedToggle value={answerMode} onChange={(v) => setAnswerMode(v as AnswerMode)} accent
                options={[{ value: "type", label: "Type" }, { value: "mc", label: "Multiple choice" }]} />
            </div>

            <div className="kn-field">
              <div className="kn-label">Kana sets</div>
              <KanaGroupSelector selection={selection} onChange={setSelection} />
              <div className="kn-counter">
                <span className="kn-counter-chip"><b>{selCount}</b> characters</span> selected for this session
              </div>
            </div>

            <div className="kn-field">
              <button className="kn-btn primary fullwidth lg" disabled={selCount === 0} onClick={start}>
                Start practice <ArrowIcon />
              </button>
              {selCount === 0 && <div className="kn-hint">Pick at least one set to begin.</div>}
            </div>
          </div>
        )}

        {/* ---------- QUIZ ---------- */}
        {phase === "quiz" && card && (
          <div className="kana-arena kn-rise" key={"quiz-" + idx}>
            <div className="kn-hud">
              <div className="kn-hud-left">
                <div className={
                  "kn-streak" +
                  (stats.streak >= 3 ? " hot" : "") +
                  (stats.streak >= 6 ? " blaze" : "") +
                  (feedback === "correct" ? " bump" : "")
                }>
                  <FlameIcon />
                  <span className="kn-streak-n">{stats.streak}</span>
                  <span className="kn-streak-l">streak</span>
                </div>
                <div className="kn-tally">
                  <span className="kn-tally-ok"><i />{stats.correct} correct</span>
                  <span className="kn-tally-err"><i />{stats.wrong} wrong</span>
                </div>
              </div>
              <ProgressRing done={idx} total={queue.length} />
            </div>

            <div className={"kn-stage " + feedback}>
              <div className="kn-stage-ring" aria-hidden="true" />
              <KanaPrompt card={card} dir={curDir} anim={charAnim} />
              {feedback === "wrong" && (
                <div className="kn-reveal">
                  <span className="kn-reveal-lab">Answer</span>
                  <div className="kn-reveal-pair">
                    {curDir === "k2r"
                      ? (<><span className="kn-reveal-main">{card.romaji}</span><span className="kn-reveal-alt jp">{card.kana}</span></>)
                      : (<><span className="kn-reveal-main jp">{card.kana}</span><span className="kn-reveal-alt">{card.romaji}</span></>)}
                  </div>
                </div>
              )}
            </div>

            <div className="kn-answer">
              {answerMode === "type" ? (
                <>
                  <div className="kn-input-wrap">
                    <input ref={inputRef}
                      className={"kn-input" + (feedback === "correct" ? " is-correct" : feedback === "wrong" ? " is-wrong" : "")}
                      value={typed}
                      placeholder={curDir === "k2r" ? "Type the reading…" : "Type romaji for the kana…"}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (feedback === "wrong") goNext();
                          else if (typed.trim()) submit(typed);
                        }
                      }}
                      autoFocus />
                    {feedback === "none" && (
                      <span className="kn-kbd"><kbd>↵</kbd></span>
                    )}
                  </div>
                  {feedback === "wrong" && (
                    <div className="kn-continue"><button className="kn-btn ghost fullwidth" onClick={goNext}>Continue <ArrowIcon /></button></div>
                  )}
                </>
              ) : (
                <>
                  <div className="kn-choices">
                    {choices.map((opt, i) => {
                      let cls = "kn-choice";
                      if (feedback !== "none") {
                        if (opt.correct) cls += " correct";
                        else if (picked === i) cls += " wrong";
                        else cls += " dim";
                      }
                      const isKana = curDir === "r2k";
                      return (
                        <button key={i} className={cls} disabled={feedback !== "none"}
                          onClick={() => pickChoice(opt, i)}>
                          <span className="kn-choice-key">{i + 1}</span>
                          <span className={isKana ? "jp" : ""}>{opt.v}</span>
                        </button>
                      );
                    })}
                  </div>
                  {feedback === "wrong" && (
                    <div className="kn-continue"><button className="kn-btn ghost fullwidth" onClick={goNext}>Continue <ArrowIcon /></button></div>
                  )}
                </>
              )}
            </div>

            <div className="kn-legend">
              {answerMode === "mc" ? (<><kbd>1</kbd>–<kbd>4</kbd> to answer · <kbd>↵</kbd> to continue</>) : (<><kbd>↵</kbd> to submit</>)}
            </div>

            <div className="kn-controls">
              <button className="kn-btn quiet sm" onClick={() => goNext()}>Skip</button>
              <button className="kn-btn quiet sm" onClick={() => endSession()}>End session</button>
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
            <div className="kana-col kn-rise" key="summary">
              <div className="kn-summary">
                <div className="kn-sum-crown">
                  <div className="kn-sum-medal"><MedalIcon /></div>
                  <div className="kn-sum-cue">Session complete</div>
                  <div className="kn-sum-acc">{acc}<span>%</span></div>
                  <div className="kn-sum-counts">
                    <span className="kn-sum-count ok"><i /><b>{c}</b> correct</span>
                    <span className="kn-sum-count err"><i /><b>{w}</b> wrong</span>
                  </div>
                </div>

                {liveTough.length > 0 && (
                  <div className="kn-tough">
                    <div className="kn-tough-h">Toughest kana</div>
                    <div className="kn-tough-list">
                      {liveTough.map((m, i) => (
                        <div key={i} className="kn-tough-row">
                          <span className="kn-tough-char jp">{m.card.kana}</span>
                          <span className="kn-tough-read">{m.card.romaji}</span>
                          <span className="kn-tough-miss">missed ×{m.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="kn-sum-actions">
                  <button className="kn-btn primary" onClick={start}>Practice again</button>
                  <button className="kn-btn ghost" onClick={() => window.location.href = "/"}>Back to library</button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
