/* Fuchine — Review (SRS): sentence-mining flashcards, question → answer + grade */
const { useState, useEffect } = React;

const SESSION = { done: 6, total: 24, again: 3, learn: 5, due: 16 };

const CARD = {
  pre: '毎朝川沿いを',
  target: '歩いて',
  reading: 'あるいて',
  post: 'います。',
  en: 'Every morning, I walk along the river.',
  pos: 'Verb · te-form',
  lemma: { w: '歩く', r: 'あるく' },
  defs: ['to walk', 'to go on foot'],
  source: { channel: 'Kyoto Slow Living', time: '5:24', title: '京都の朝、静かな散歩' },
};

const GRADES = [
  { key: 'again', label: 'Again', when: '<1 min', cls: 'again' },
  { key: 'hard',  label: 'Hard',  when: '<10 min', cls: 'hard' },
  { key: 'good',  label: 'Good',  when: '1 day', cls: 'good' },
  { key: 'easy',  label: 'Easy',  when: '4 days', cls: 'easy' },
];

/* ---------------- Sidebar ---------------- */
function Sidebar({ expanded }) {
  const items = [
    { icon: Ic.home, label: 'Home' },
    { icon: Ic.library, label: 'Library' },
    { icon: Ic.review, label: 'Review', active: true },
    { icon: Ic.settings, label: 'Settings' },
  ];
  return (
    <aside className="side">
      <div className="side-head">
        <span className="brand-mark">淵</span>
        <span className="brand-name">Fuchine</span>
      </div>
      <nav className="nav">
        {items.map((it) => {
          const I = it.icon;
          return (
            <button key={it.label} className={'nav-item' + (it.active ? ' active' : '')} title={it.label}>
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

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "question",
  "sidebar": "collapsed"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);

  const expanded = t.sidebar === 'expanded';
  const revealed = t.state === 'answer';
  const pct = Math.round((SESSION.done / SESSION.total) * 100);

  return (
    <div className={'app' + (expanded ? ' expanded' : '')}>
      <Sidebar expanded={expanded} />

      <div className="rev-main">
        {/* top bar: progress + counts + exit */}
        <div className="rev-top">
          <button className="rev-exit" title="End session"
            onClick={() => { window.location.href = 'Dashboard.html'; }}><Ic.close /></button>
          <div className="rev-progress">
            <div className="rev-bar"><div className="rev-fill" style={{ width: pct + '%' }} /></div>
            <span className="rev-count"><b>{SESSION.done}</b> / {SESSION.total}</span>
          </div>
          <div className="rev-pills">
            <span className="pill again"><i />{SESSION.again}</span>
            <span className="pill learn"><i />{SESSION.learn}</span>
            <span className="pill due"><i />{SESSION.due}</span>
          </div>
        </div>

        {/* card stage */}
        <div className="rev-stage">
          <div className="card rise" key={t.state}>
            <div className="card-kicker">
              {revealed ? <><Ic.check /> Recall checked</> : <>Recall the missing word</>}
            </div>

            {/* sentence with cloze / revealed target */}
            <div className="card-sentence jp">
              {CARD.pre}
              {revealed ? (
                <ruby className="target">{CARD.target}<rt>{CARD.reading}</rt></ruby>
              ) : (
                <span className="blank">［ ＿＿ ］</span>
              )}
              {CARD.post}
            </div>

            <div className="card-en">{CARD.en}</div>

            <button className="card-audio" title="Replay clip audio">
              <Ic.volume /> Replay audio
            </button>

            {/* revealed detail */}
            {revealed && (
              <div className="card-reveal">
                <div className="cr-grid">
                  <div className="cr-row">
                    <span className="cr-k">Reading</span>
                    <span className="cr-v jp">{CARD.reading}</span>
                  </div>
                  <div className="cr-row">
                    <span className="cr-k">Dictionary form</span>
                    <span className="cr-v jp">{CARD.lemma.w}<span className="cr-r">{CARD.lemma.r}</span></span>
                  </div>
                  <div className="cr-row">
                    <span className="cr-k">Meaning</span>
                    <span className="cr-v">{CARD.defs.join('; ')}</span>
                  </div>
                </div>
                <a className="cr-source" href="Player.html">
                  <span className="cr-thumb"><Ic.youtube /></span>
                  <span className="cr-meta">
                    <span className="cr-from">{CARD.source.channel} · {CARD.source.time}</span>
                    <span className="cr-title jp">{CARD.source.title}</span>
                  </span>
                  <span className="cr-play"><Ic.play /> Play clip</span>
                </a>
              </div>
            )}
          </div>
        </div>

        {/* action dock */}
        <div className="rev-dock">
          {!revealed ? (
            <button className="show-btn" onClick={() => setTweak('state', 'answer')}>
              Show answer
              <kbd>Space</kbd>
            </button>
          ) : (
            <div className="grades">
              {GRADES.map((g) => (
                <button key={g.key} className={'grade ' + g.cls}
                  onClick={() => setTweak('state', 'question')}>
                  <span className="g-label">{g.label}</span>
                  <span className="g-when">{g.when}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Review state" />
        <TweakRadio label="Card" value={t.state}
          options={['question', 'answer']} onChange={(v) => setTweak('state', v)} />

        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
        <TweakRadio label="Sidebar" value={t.sidebar}
          options={['collapsed', 'expanded']} onChange={(v) => setTweak('sidebar', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
