/* Fuchine — Listening Quiz
   Listen to a real clip, then answer. Ear-training first.
   Question types: mc-en · mc-ja · cloze.
   States: question · answered-correct · answered-incorrect. */
const { useState, useEffect } = React;

const CLIP = { channel: 'Kyoto Slow Living', time: '5:24', dur: '0:04' };
const SESSION = { idx: 4, total: 10, correct: 3 };

/* the heard line (shared truth) */
const HEARD = { ja: '毎朝川沿いを歩いています。', en: 'Every morning, I walk along the river.' };

/* deterministic clip waveform */
const CLIP_WAVE = [3,5,7,6,8,6,4,5,8,7,5,4,3,4,6,8,7,5,4,6,7,5,3,4,6,7,5,4,5,6,4,3,4,5,3,2,3,4];

const QUESTIONS = {
  'mc-en': {
    kicker: 'Choose the translation',
    prompt: 'Which English matches what you heard?',
    layout: 'list',
    options: [
      { en: 'Every morning, I walk along the river.' },
      { en: 'Every morning, I run along the river.' },
      { en: 'Every evening, I walk along the river.' },
      { en: 'Every morning, I walk along the sea.' },
    ],
    correct: 0, demoWrong: 1,
    note: <>毎朝 = <b>every morning</b>, 川沿い = <b>along the river</b>, 歩いています = <b>am walking</b>. The traps swap 歩く (walk) for 走る (run), 朝 (morning) for 晩 (evening), and 川 (river) for 海 (sea).</>,
  },
  'mc-ja': {
    kicker: 'Match the sentence',
    prompt: 'Which sentence did you hear?',
    layout: 'list-ja',
    options: [
      { ja: '毎朝川沿いを歩いています。', rt: 'まいあさ かわぞいを あるいています' },
      { ja: '毎晩川沿いを歩いています。', rt: 'まいばん かわぞいを あるいています' },
      { ja: '毎朝川沿いを走っています。', rt: 'まいあさ かわぞいを はしっています' },
      { ja: '毎朝海沿いを歩いています。', rt: 'まいあさ うみぞいを あるいています' },
    ],
    correct: 0, demoWrong: 2,
    note: <>Listen for <b className="jp">あさ</b> (morning) vs <b className="jp">ばん</b> (night), and the verb stem <b className="jp">ある</b>く (walk) vs <b className="jp">はし</b>る (run). The vowel openings give them away.</>,
  },
  'cloze': {
    kicker: 'Fill in the blank',
    prompt: 'Complete the missing word from what you heard.',
    layout: 'cloze',
    pre: '毎朝川沿いを', post: 'います。',
    options: [
      { ja: '歩いて', rt: 'あるいて' },
      { ja: '走って', rt: 'はしって' },
      { ja: '泳いで', rt: 'およいで' },
      { ja: '立って', rt: 'たって' },
    ],
    correct: 0, demoWrong: 1,
    note: <>The te-form <b className="jp">歩いて</b> + います makes an ongoing/habitual action — “am walking.” <b className="jp">走って</b> (running) is the near neighbour to rule out by ear.</>,
  },
};

/* ---------------- Sidebar (minimal rail) ---------------- */
function Rail() {
  const items = [
    { icon: Ic.home, label: 'Home', href: 'Home.html' },
    { icon: Ic.library, label: 'Library', href: 'Albums.html', active: true },
    { icon: Ic.review, label: 'Review', href: 'Review.html' },
    { icon: Ic.settings, label: 'Settings', href: 'Settings.html' },
  ];
  return (
    <aside className="side">
      <div className="side-head"><span className="brand-mark">淵</span></div>
      <nav className="nav">
        {items.map((it) => {
          const I = it.icon;
          return (
            <button key={it.label} className={'nav-item' + (it.active ? ' active' : '')}
              title={it.label} onClick={() => { window.location.href = it.href; }}>
              <I />
            </button>
          );
        })}
      </nav>
      <div className="side-spacer" />
      <div className="side-foot"><span className="avatar">M</span></div>
    </aside>
  );
}

/* ---------------- Clip player ---------------- */
function Clip({ slow, onSlow }) {
  return (
    <div className="clip">
      <button className="clip-play" title="Replay clip"><Ic.play /></button>
      <div className="clip-mid">
        <div className="clip-label">
          <span>Listen</span>
          <span className="src">{CLIP.channel} · {CLIP.time}</span>
        </div>
        <div className="clip-wave">
          {CLIP_WAVE.map((h, i) => (
            <i key={i} className={i < 22 ? 'on' : ''} style={{ height: (h / 9 * 100) + '%' }} />
          ))}
        </div>
      </div>
      <div className="clip-side">
        <span className="clip-time">{CLIP.dur}</span>
        <button className={'clip-slow' + (slow ? ' on' : '')} onClick={onSlow} title="Play at 0.75× speed">
          0.75×
        </button>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "type": "mc-en",
  "outcome": "unanswered"
}/*EDITMODE-END*/;

const KEYS = ['A', 'B', 'C', 'D'];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);

  const Q = QUESTIONS[t.type];
  const [slow, setSlow] = useState(false);

  /* picked option index; null = unanswered */
  const [picked, setPicked] = useState(null);

  /* sync from the Tweaks "outcome" control (and on type change) */
  useEffect(() => {
    if (t.outcome === 'correct') setPicked(Q.correct);
    else if (t.outcome === 'incorrect') setPicked(Q.demoWrong);
    else setPicked(null);
  }, [t.outcome, t.type]);

  const answered = picked !== null;
  const isCorrect = picked === Q.correct;

  const choose = (i) => {
    if (answered) return;
    setPicked(i);
    setTweak('outcome', i === Q.correct ? 'correct' : 'incorrect');
  };
  const reset = () => { setPicked(null); setTweak('outcome', 'unanswered'); };

  const pct = Math.round(((SESSION.idx - 1) / SESSION.total) * 100);

  /* option class for answered states */
  const optClass = (i) => {
    if (!answered) return 'opt';
    if (i === Q.correct) return 'opt correct';
    if (i === picked) return 'opt wrong';
    return 'opt muted';
  };

  return (
    <div className="app">
      <Rail />

      <div className="lq-main">
        {/* top bar */}
        <div className="lq-top">
          <button className="lq-exit" title="Exit quiz"
            onClick={() => { window.location.href = 'Dashboard.html'; }}><Ic.close /></button>
          <div className="lq-title">
            <b>Listening</b>
            <span>Train your ear from real clips</span>
          </div>
          <div className="lq-progress">
            <div className="lq-bar"><div className="lq-fill" style={{ width: pct + '%' }} /></div>
            <span className="lq-count"><b>{SESSION.idx}</b> / {SESSION.total}</span>
          </div>
          <span className="lq-score"><i />{SESSION.correct} <b>correct</b></span>
        </div>

        {/* stage */}
        <div className="lq-stage">
          <div className="card rise" key={t.type}>
            <Clip slow={slow} onSlow={() => setSlow((s) => !s)} />

            {/* prompt */}
            <div className="q-head">
              <div className="q-kicker">{Q.kicker}</div>
              <div className="q-prompt">{Q.prompt}</div>
            </div>

            {/* cloze sentence preview */}
            {Q.layout === 'cloze' && (
              <div className="cloze-line jp">
                {Q.pre}
                <span className={'cloze-blank' + (answered ? (isCorrect ? ' filled good' : ' filled bad') : '')}>
                  {answered ? Q.options[picked].ja : '＿＿'}
                </span>
                {Q.post}
                <span className="cloze-en">“{HEARD.en}”</span>
              </div>
            )}

            {/* options */}
            <div className={'opts' + (Q.layout === 'cloze' ? ' chips' : '')}>
              {Q.options.map((o, i) => (
                <button key={i} className={optClass(i)} disabled={answered} onClick={() => choose(i)}>
                  <span className="opt-key">{KEYS[i]}</span>
                  <span className="opt-body">
                    {o.en && <span className="opt-en">{o.en}</span>}
                    {o.ja && <span className="opt-ja jp">{o.ja}</span>}
                    {o.rt && <span className="opt-rt jp">{o.rt}</span>}
                  </span>
                  <span className="opt-mark">
                    {answered && i === Q.correct && <Ic.check />}
                    {answered && i === picked && i !== Q.correct && <Ic.close />}
                  </span>
                </button>
              ))}
            </div>

            {/* feedback */}
            {answered && (
              <div className={'fb ' + (isCorrect ? 'correct' : 'incorrect')}>
                <div className="fb-head">
                  <span className="fb-ic">{isCorrect ? <Ic.check /> : <Ic.close />}</span>
                  <span className="fb-title">{isCorrect ? 'Correct' : 'Not quite'}</span>
                </div>
                {!isCorrect && (
                  <div className="fb-answer">
                    <span className="lab">Answer</span>
                    <span className="ja jp">{HEARD.ja}</span>
                    <span className="en">{HEARD.en}</span>
                  </div>
                )}
                <div className="fb-note">{Q.note}</div>
              </div>
            )}
          </div>
        </div>

        {/* dock */}
        <div className="lq-dock">
          {!answered ? (
            <span className="dock-hint"><Ic.volume /> Replay as many times as you need</span>
          ) : (
            <button className="btn-skip" onClick={reset}>Try again</button>
          )}
          <div className="dock-spacer" />
          <button className="btn-next" disabled={!answered} onClick={reset}>
            Next <kbd>↵</kbd><Ic.arrow />
          </button>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Question type" />
        <TweakSelect label="Type" value={t.type}
          options={['mc-en', 'mc-ja', 'cloze']}
          onChange={(v) => { setTweak('type', v); }} />

        <TweakSection label="Answer state" />
        <TweakSelect label="Outcome" value={t.outcome}
          options={['unanswered', 'correct', 'incorrect']}
          onChange={(v) => setTweak('outcome', v)} />

        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
