/* Fuchine — Kana Practice (standalone recall drill)
   100% client-side. Static kana dataset → shuffled queue → check locally.
   States: Setup · Quiz (Type / Multiple choice) · Summary.
   Gamified-but-calm: streak momentum, progress ring, juicy feedback.
   New primitives: SegmentedToggle · KanaGroupSelector · KanaPrompt · QuizStat. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ============================================================
   Static dataset — [romaji, hiragana, katakana] per group
   ============================================================ */
const TABLES = {
  monograph: [
    ['a','あ','ア'],['i','い','イ'],['u','う','ウ'],['e','え','エ'],['o','お','オ'],
    ['ka','か','カ'],['ki','き','キ'],['ku','く','ク'],['ke','け','ケ'],['ko','こ','コ'],
    ['sa','さ','サ'],['shi','し','シ'],['su','す','ス'],['se','せ','セ'],['so','そ','ソ'],
    ['ta','た','タ'],['chi','ち','チ'],['tsu','つ','ツ'],['te','て','テ'],['to','と','ト'],
    ['na','な','ナ'],['ni','に','ニ'],['nu','ぬ','ヌ'],['ne','ね','ネ'],['no','の','ノ'],
    ['ha','は','ハ'],['hi','ひ','ヒ'],['fu','ふ','フ'],['he','へ','ヘ'],['ho','ほ','ホ'],
    ['ma','ま','マ'],['mi','み','ミ'],['mu','む','ム'],['me','め','メ'],['mo','も','モ'],
    ['ya','や','ヤ'],['yu','ゆ','ユ'],['yo','よ','ヨ'],
    ['ra','ら','ラ'],['ri','り','リ'],['ru','る','ル'],['re','れ','レ'],['ro','ろ','ロ'],
    ['wa','わ','ワ'],['wo','を','ヲ'],['n','ん','ン'],
  ],
  dakuten: [
    ['ga','が','ガ'],['gi','ぎ','ギ'],['gu','ぐ','グ'],['ge','げ','ゲ'],['go','ご','ゴ'],
    ['za','ざ','ザ'],['ji','じ','ジ'],['zu','ず','ズ'],['ze','ぜ','ゼ'],['zo','ぞ','ゾ'],
    ['da','だ','ダ'],['de','で','デ'],['do','ど','ド'],
    ['ba','ば','バ'],['bi','び','ビ'],['bu','ぶ','ブ'],['be','べ','ベ'],['bo','ぼ','ボ'],
    ['pa','ぱ','パ'],['pi','ぴ','ピ'],['pu','ぷ','プ'],['pe','ぺ','ペ'],['po','ぽ','ポ'],
  ],
  digraph: [
    ['kya','きゃ','キャ'],['kyu','きゅ','キュ'],['kyo','きょ','キョ'],
    ['sha','しゃ','シャ'],['shu','しゅ','シュ'],['sho','しょ','ショ'],
    ['cha','ちゃ','チャ'],['chu','ちゅ','チュ'],['cho','ちょ','チョ'],
    ['nya','にゃ','ニャ'],['nyu','にゅ','ニュ'],['nyo','にょ','ニョ'],
    ['hya','ひゃ','ヒャ'],['hyu','ひゅ','ヒュ'],['hyo','ひょ','ヒョ'],
    ['mya','みゃ','ミャ'],['myu','みゅ','ミュ'],['myo','みょ','ミョ'],
    ['rya','りゃ','リャ'],['ryu','りゅ','リュ'],['ryo','りょ','リョ'],
  ],
  'digraph-dakuten': [
    ['gya','ぎゃ','ギャ'],['gyu','ぎゅ','ギュ'],['gyo','ぎょ','ギョ'],
    ['ja','じゃ','ジャ'],['ju','じゅ','ジュ'],['jo','じょ','ジョ'],
    ['bya','びゃ','ビャ'],['byu','びゅ','ビュ'],['byo','びょ','ビョ'],
    ['pya','ぴゃ','ピャ'],['pyu','ぴゅ','ピュ'],['pyo','ぴょ','ピョ'],
  ],
};

const GROUP_META = [
  { key: 'monograph', label: 'Monographs' },
  { key: 'dakuten', label: 'Dakuten' },
  { key: 'digraph', label: 'Digraphs' },
  { key: 'digraph-dakuten', label: 'Digraphs + dakuten' },
];
const TYPE_META = [
  { key: 'hiragana', label: 'Hiragana', glyph: 'あ' },
  { key: 'katakana', label: 'Katakana', glyph: 'ア' },
];

/* flat dataset */
const KANA = [];
Object.entries(TABLES).forEach(([group, rows]) => {
  rows.forEach(([romaji, hira, kata]) => {
    KANA.push({ kana: hira, romaji, type: 'hiragana', group });
    KANA.push({ kana: kata, romaji, type: 'katakana', group });
  });
});
const countFor = (type, group) => TABLES[group].length;
const previewFor = (type, group) => TABLES[group].slice(0, 3).map((r) => type === 'hiragana' ? r[1] : r[2]).join(' ');

/* accept common romaji spelling variants in Type mode */
const ALT = { shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], ji: ['zi','di'], zu: ['du'],
  sha: ['sya'], shu: ['syu'], sho: ['syo'], cha: ['tya'], chu: ['tyu'], cho: ['tyo'],
  ja: ['jya','zya'], ju: ['jyu','zyu'], jo: ['jyo','zyo'], o: ['wo'] };
const matchRomaji = (input, romaji) => {
  const v = input.trim().toLowerCase();
  if (v === romaji) return true;
  return (ALT[romaji] || []).includes(v);
};
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/* ============================================================
   Sidebar (AppShell nav)
   ============================================================ */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'kana', icon: Ic.kana, label: 'Kana', active: true },
    { key: 'dict', icon: Ic.dict, label: 'Dictionary', href: 'Dictionary.html' },
    { key: 'settings', icon: Ic.settings, label: 'Settings', href: 'Settings.html' },
  ];
  return (
    <aside className="side">
      <div className="side-head">
        <span className="brand-mark">淵</span>
        <span className="brand-name">Fuchine</span>
        <button className="collapse-btn" onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label="Toggle sidebar">
          <Ic.chevron />
        </button>
      </div>
      <nav className="nav">
        {items.map((it) => {
          const I = it.icon;
          return (
            <button key={it.key} className={'nav-item' + (it.active ? ' active' : '')}
              title={collapsed ? it.label : undefined}
              onClick={() => { if (it.href) window.location.href = it.href; }}>
              <I /><span className="nav-text">{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="side-spacer" />
      <div className="side-foot">
        <button className="account">
          <span className="avatar">M</span>
          <span className="account-meta">
            <span className="account-name">Mai Tanaka</span>
            <span className="account-mail">mai@fuchi.app</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

/* ============================================================
   Primitives
   ============================================================ */
function SegmentedToggle({ value, options, onChange, accent }) {
  return (
    <div className={'segtog' + (accent ? ' accent' : '')} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value}
          className={'segtog-b' + (value === o.value ? ' on' : '')}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function KanaGroupSelector({ selection, onChange }) {
  const isOn = (type, group) => !!selection[type + '-' + group];
  const setCol = (type, on) => {
    const next = { ...selection };
    GROUP_META.forEach((g) => { next[type + '-' + g.key] = on; });
    onChange(next);
  };
  const toggle = (type, group) => {
    const k = type + '-' + group;
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
            <button key={g.key} className={'kn-group' + (isOn(tm.key, g.key) ? ' on' : '')}
              onClick={() => toggle(tm.key, g.key)} role="checkbox" aria-checked={isOn(tm.key, g.key)}>
              <span className="kn-box"><Ic.check /></span>
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

function KanaPrompt({ card, dir, anim }) {
  const showKana = dir === 'k2r';
  return (
    <>
      <div className="kn-cue">{showKana ? 'What is the reading?' : 'Which kana is this?'}</div>
      <div className={'kn-char ' + (showKana ? 'jp' : 'romaji') + ' ' + anim} key={card.kana + '-' + anim}>
        {showKana ? card.kana : card.romaji}
      </div>
    </>
  );
}

function ProgressRing({ done, total }) {
  const r = 25.5, c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <div className="kn-ring" title={done + ' of ' + total}>
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

function QuizStat({ label, value, variant }) {
  return (
    <div className={'kn-stat' + (variant ? ' ' + variant : '')}>
      <span className="kn-stat-n">{value}</span>
      <span className="kn-stat-l">{label}</span>
    </div>
  );
}

/* ============================================================
   App
   ============================================================ */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "demo": "live",
  "collapsed": false
}/*EDITMODE-END*/;

const SAMPLE = { kana: 'か', romaji: 'ka', type: 'hiragana', group: 'monograph' };

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);

  // setup options
  const [direction, setDirection] = useState('k2r'); // k2r | r2k | both
  const [answerMode, setAnswerMode] = useState('type'); // type | mc
  const [selection, setSelection] = useState({ 'hiragana-monograph': true });

  // quiz state
  const [phase, setPhase] = useState('setup'); // setup | quiz | summary
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [dirs, setDirs] = useState([]);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, streak: 0 });
  const [feedback, setFeedback] = useState('none'); // none | correct | wrong
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState(null);
  const [misses, setMisses] = useState({});
  const inputRef = useRef(null);
  const advanceTimer = useRef(null);

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggleSide = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const pool = useMemo(() => KANA.filter((k) => selection[k.type + '-' + k.group]), [selection]);
  const selCount = pool.length;
  const demo = t.demo;

  const resolveDir = useCallback(() => direction === 'both' ? (Math.random() < 0.5 ? 'k2r' : 'r2k') : direction, [direction]);

  const start = () => {
    if (selCount === 0) return;
    const q = shuffle(pool);
    setQueue(q);
    setDirs(q.map(() => resolveDir()));
    setIdx(0);
    setStats({ correct: 0, wrong: 0, streak: 0 });
    setMisses({});
    setFeedback('none'); setTyped(''); setPicked(null);
    setPhase('quiz');
  };

  const goNext = useCallback(() => {
    setFeedback('none'); setTyped(''); setPicked(null);
    setIdx((i) => {
      const ni = i + 1;
      if (ni >= queue.length) { setPhase('summary'); return i; }
      return ni;
    });
  }, [queue.length]);

  const card = queue[idx];
  const curDir = dirs[idx] || direction;

  const submit = useCallback((value) => {
    if (!card || feedback !== 'none') return;
    const ok = matchRomaji(value, card.romaji);
    if (ok) {
      setStats((s) => ({ ...s, correct: s.correct + 1, streak: s.streak + 1 }));
      setFeedback('correct');
      advanceTimer.current = setTimeout(goNext, 620);
    } else {
      setStats((s) => ({ ...s, wrong: s.wrong + 1, streak: 0 }));
      setMisses((m) => { const k = card.kana; const prev = m[k] || { card, n: 0 }; return { ...m, [k]: { card, n: prev.n + 1 } }; });
      setFeedback('wrong');
    }
  }, [card, feedback, goNext]);

  const choices = useMemo(() => {
    if (answerMode !== 'mc' || !card) return [];
    const showKana = curDir === 'k2r';
    const correct = showKana ? card.romaji : card.kana;
    const seen = new Set([correct]);
    const distract = [];
    for (const c of shuffle(pool)) {
      const val = showKana ? c.romaji : c.kana;
      if (seen.has(val)) continue;
      seen.add(val); distract.push(val);
      if (distract.length === 3) break;
    }
    if (distract.length < 3) {
      for (const c of shuffle(KANA)) {
        const val = showKana ? c.romaji : (c.type === card.type ? c.kana : null);
        if (!val || seen.has(val)) continue;
        seen.add(val); distract.push(val);
        if (distract.length === 3) break;
      }
    }
    return shuffle([correct, ...distract]).map((v) => ({ v, correct: v === correct }));
  }, [answerMode, card, curDir, pool, idx]);

  const pickChoice = (opt, i) => {
    if (feedback !== 'none') return;
    setPicked(i);
    submit(curDir === 'k2r' ? opt.v : (KANA.find((k) => k.kana === opt.v)?.romaji || (opt.correct ? card.romaji : '__')));
  };

  useEffect(() => {
    if (phase === 'quiz' && answerMode === 'type' && feedback === 'none' && inputRef.current) inputRef.current.focus();
  }, [phase, answerMode, feedback, idx]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    const onKey = (e) => {
      if (feedback === 'wrong' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goNext(); return; }
      if (feedback !== 'none') return;
      if (answerMode === 'mc' && /^[1-4]$/.test(e.key)) { const i = +e.key - 1; if (choices[i]) pickChoice(choices[i], i); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, answerMode, feedback, choices, goNext]);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const endSession = () => { clearTimeout(advanceTimer.current); setPhase('summary'); };

  // ---- derived view (demo overrides) ----
  let view = phase;
  let vCard = card, vDir = curDir, vFeedback = feedback, vStats = stats, vChoices = choices, vMode = answerMode, vPicked = picked;
  const demoMC = demo !== 'live';
  if (demo === 'setup') view = 'setup';
  else if (demo === 'quiz-type') { view = 'quiz'; vCard = SAMPLE; vDir = 'k2r'; vFeedback = 'none'; vMode = 'type'; vStats = { correct: 7, wrong: 2, streak: 4 }; }
  else if (demo === 'quiz-mc') { view = 'quiz'; vCard = SAMPLE; vDir = 'k2r'; vFeedback = 'none'; vMode = 'mc'; vStats = { correct: 7, wrong: 2, streak: 4 }; vChoices = [{ v: 'ka', correct: true }, { v: 'sa', correct: false }, { v: 'ta', correct: false }, { v: 'na', correct: false }]; }
  else if (demo === 'correct') { view = 'quiz'; vCard = SAMPLE; vDir = 'k2r'; vFeedback = 'correct'; vMode = 'mc'; vStats = { correct: 8, wrong: 2, streak: 5 }; vChoices = [{ v: 'ka', correct: true }, { v: 'sa', correct: false }, { v: 'ta', correct: false }, { v: 'na', correct: false }]; vPicked = 0; }
  else if (demo === 'wrong') { view = 'quiz'; vCard = SAMPLE; vDir = 'k2r'; vFeedback = 'wrong'; vMode = 'mc'; vStats = { correct: 7, wrong: 3, streak: 0 }; vChoices = [{ v: 'ka', correct: true }, { v: 'sa', correct: false }, { v: 'ta', correct: false }, { v: 'na', correct: false }]; vPicked = 1; }
  else if (demo === 'summary') view = 'summary';

  const total = demo === 'live' ? queue.length : 24;
  const done = demo === 'live' ? idx : 11;
  const charAnim = vFeedback === 'correct' ? 'pop' : vFeedback === 'wrong' ? 'shake' : 'enter';

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggleSide} />

      <main className="main kana-main">
        <div className="kana-scroll">

          {/* ---------- SETUP ---------- */}
          {view === 'setup' && (
            <div className="kana-col wide kn-rise" key="setup">
              <div className="kn-hero">
                <span className="kn-eyebrow"><Ic.bolt /> Recall drill</span>
                <h1 className="kn-title">Kana Practice</h1>
                <p className="kn-sub">Drill the syllabaries until they're automatic.</p>
              </div>

              <div className="kn-field">
                <div className="kn-label">Direction</div>
                <SegmentedToggle value={direction} onChange={setDirection} accent
                  options={[
                    { value: 'k2r', label: 'Kana → Romaji' },
                    { value: 'r2k', label: 'Romaji → Kana' },
                    { value: 'both', label: 'Both' },
                  ]} />
              </div>

              <div className="kn-field">
                <div className="kn-label">Answer mode</div>
                <SegmentedToggle value={answerMode} onChange={setAnswerMode} accent
                  options={[{ value: 'type', label: 'Type' }, { value: 'mc', label: 'Multiple choice' }]} />
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
                  Start practice <Ic.arrow />
                </button>
                {selCount === 0 && <div className="kn-hint">Pick at least one set to begin.</div>}
              </div>
            </div>
          )}

          {/* ---------- QUIZ ---------- */}
          {view === 'quiz' && vCard && (
            <div className="kana-arena kn-rise" key={'quiz-' + (demo === 'live' ? idx : demo)}>
              <div className="kn-hud">
                <div className="kn-hud-left">
                  <div className={'kn-streak' + (vStats.streak >= 3 ? ' hot' : '') + (vStats.streak >= 6 ? ' blaze' : '') + (vFeedback === 'correct' ? ' bump' : '')}>
                    <Ic.flame />
                    <span className="kn-streak-n">{vStats.streak}</span>
                    <span className="kn-streak-l">streak</span>
                  </div>
                  <div className="kn-tally">
                    <span className="kn-tally-ok"><i />{vStats.correct} correct</span>
                    <span className="kn-tally-err"><i />{vStats.wrong} wrong</span>
                  </div>
                </div>
                <ProgressRing done={done} total={total} />
              </div>

              <div className={'kn-stage ' + vFeedback}>
                <div className="kn-stage-ring" aria-hidden="true" />
                <KanaPrompt card={vCard} dir={vDir} anim={charAnim} />
                {vFeedback === 'wrong' && (
                  <div className="kn-reveal">
                    <span className="kn-reveal-lab">Answer</span>
                    <div className="kn-reveal-pair">
                      {vDir === 'k2r'
                        ? (<><span className="kn-reveal-main">{vCard.romaji}</span><span className="kn-reveal-alt jp">{vCard.kana}</span></>)
                        : (<><span className="kn-reveal-main jp">{vCard.kana}</span><span className="kn-reveal-alt">{vCard.romaji}</span></>)}
                    </div>
                  </div>
                )}
              </div>

              <div className="kn-answer">
                {vMode === 'type' ? (
                  <>
                    <div className="kn-input-wrap">
                      <input ref={inputRef}
                        className={'kn-input' + (vFeedback === 'correct' ? ' is-correct' : vFeedback === 'wrong' ? ' is-wrong' : '')}
                        value={demoMC ? '' : typed}
                        placeholder={vDir === 'k2r' ? 'Type the reading…' : 'Type romaji for the kana…'}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { if (feedback === 'wrong') goNext(); else if (typed.trim()) submit(typed); } }}
                        disabled={demoMC} autoFocus />
                      {vFeedback === 'none' && <span className="kn-kbd"><kbd>↵</kbd></span>}
                    </div>
                    {vFeedback === 'wrong' && (
                      <div className="kn-continue"><button className="kn-btn ghost fullwidth" onClick={goNext}>Continue <Ic.arrow /></button></div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="kn-choices">
                      {vChoices.map((opt, i) => {
                        let cls = 'kn-choice';
                        if (vFeedback !== 'none') {
                          if (opt.correct) cls += ' correct';
                          else if (vPicked === i) cls += ' wrong';
                          else cls += ' dim';
                        }
                        const isKana = vDir === 'r2k';
                        return (
                          <button key={i} className={cls} disabled={vFeedback !== 'none'}
                            onClick={() => !demoMC && pickChoice(opt, i)}>
                            <span className="kn-choice-key">{i + 1}</span>
                            <span className={isKana ? 'jp' : ''}>{opt.v}</span>
                          </button>
                        );
                      })}
                    </div>
                    {vFeedback === 'wrong' && (
                      <div className="kn-continue"><button className="kn-btn ghost fullwidth" onClick={goNext}>Continue <Ic.arrow /></button></div>
                    )}
                  </>
                )}
              </div>

              <div className="kn-legend">
                {vMode === 'mc' ? (<><kbd>1</kbd>–<kbd>4</kbd> to answer · <kbd>↵</kbd> to continue</>) : (<><kbd>↵</kbd> to submit</>)}
              </div>

              <div className="kn-controls">
                <button className="kn-btn quiet sm" onClick={() => !demoMC && goNext()}>Skip</button>
                <button className="kn-btn quiet sm" onClick={() => !demoMC && endSession()}>End session</button>
              </div>
            </div>
          )}

          {/* ---------- SUMMARY ---------- */}
          {view === 'summary' && (() => {
            const liveTough = Object.values(misses).sort((a, b) => b.n - a.n).slice(0, 4);
            const tough = demo === 'live' ? liveTough : [
              { card: { kana: 'る', romaji: 'ru' }, n: 3 },
              { card: { kana: 'ね', romaji: 'ne' }, n: 2 },
              { card: { kana: 'ぬ', romaji: 'nu' }, n: 2 },
              { card: { kana: 'わ', romaji: 'wa' }, n: 1 },
            ];
            const c = demo === 'live' ? stats.correct : 18;
            const w = demo === 'live' ? stats.wrong : 6;
            const acc = (c + w) > 0 ? Math.round((c / (c + w)) * 100) : 0;
            return (
              <div className="kana-col kn-rise" key="summary">
                <div className="kn-summary">
                  <div className="kn-sum-crown">
                    <div className="kn-sum-medal"><Ic.medal /></div>
                    <div className="kn-sum-cue">Session complete</div>
                    <div className="kn-sum-acc">{acc}<span>%</span></div>
                    <div className="kn-sum-counts">
                      <span className="kn-sum-count ok"><i /><b>{c}</b> correct</span>
                      <span className="kn-sum-count err"><i /><b>{w}</b> wrong</span>
                    </div>
                  </div>

                  {tough.length > 0 && (
                    <div className="kn-tough">
                      <div className="kn-tough-h">Toughest kana</div>
                      <div className="kn-tough-list">
                        {tough.map((m, i) => (
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
                    <button className="kn-btn ghost" onClick={() => { window.location.href = 'Home.html'; }}>Back to library</button>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Preview state" />
        <TweakSelect label="Demo" value={t.demo}
          options={['live', 'setup', 'quiz-type', 'quiz-mc', 'correct', 'wrong', 'summary']}
          onChange={(v) => setTweak('demo', v)} />

        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
        <TweakToggle label="Collapse sidebar" value={collapsed}
          onChange={(v) => { setCollapsed(v); setTweak('collapsed', v); }} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
