/* Fuchine — Session Summary: calm end-of-review recap */
const { useEffect } = React;

const STATS = {
  cards: 24,
  time: '8:12',
  retention: 88,
  streak: 12,
};
const GRADES = [
  { label: 'Again', n: 3, cls: 'again' },
  { label: 'Hard',  n: 5, cls: 'hard' },
  { label: 'Good',  n: 12, cls: 'good' },
  { label: 'Easy',  n: 4, cls: 'easy' },
];
const WEEK = [true, true, true, true, true, true, true]; // last 7 days active
const MATURED = [
  { w: '川沿い', r: 'かわぞい', g: 'riverside' },
  { w: '澄んで', r: 'すんで', g: 'to be clear' },
  { w: '最適', r: 'さいてき', g: 'optimal' },
];

/* ---------------- Sidebar ---------------- */
function Sidebar() {
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
  "sidebar": "collapsed"
}/*EDITMODE-END*/;

const total = GRADES.reduce((s, g) => s + g.n, 0);

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const expanded = t.sidebar === 'expanded';
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className={'app' + (expanded ? ' expanded' : '')}>
      <Sidebar />

      <div className="sum-main">
        <div className="sum-scroll">
          <div className="sum-col rise">

            {/* header */}
            <div className="sum-head">
              <span className="sum-seal">淵</span>
              <h1 className="sum-title">Session complete</h1>
              <p className="sum-date">Reviewed 24 cards · Sunday, June 15</p>
            </div>

            {/* hero stats */}
            <div className="sum-stats">
              <div className="stat">
                <span className="stat-n">{STATS.cards}</span>
                <span className="stat-l">Cards reviewed</span>
              </div>
              <div className="stat">
                <span className="stat-n">{STATS.time}</span>
                <span className="stat-l">Time</span>
              </div>
              <div className="stat">
                <span className="stat-n">{STATS.retention}<span className="stat-u">%</span></span>
                <span className="stat-l">Retention</span>
              </div>
            </div>

            {/* grade breakdown */}
            <div className="sum-panel">
              <div className="panel-head">
                <span className="panel-title">How it went</span>
                <span className="panel-meta">{total} ratings</span>
              </div>
              <div className="gbar">
                {GRADES.map((g) => (
                  <div key={g.label} className={'gbar-seg ' + g.cls}
                    style={{ flexGrow: g.n }} title={`${g.label} · ${g.n}`} />
                ))}
              </div>
              <div className="glegend">
                {GRADES.map((g) => (
                  <div key={g.label} className="gleg">
                    <span className={'gdot ' + g.cls} />
                    <span className="gleg-l">{g.label}</span>
                    <span className="gleg-n">{g.n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* two-up: streak + matured */}
            <div className="sum-grid">
              <div className="sum-panel streak">
                <div className="panel-head">
                  <span className="panel-title">Streak</span>
                </div>
                <div className="streak-n"><b>{STATS.streak}</b> days</div>
                <div className="streak-week">
                  {WEEK.map((on, i) => (
                    <div key={i} className="sd">
                      <span className={'sd-dot' + (on ? ' on' : '')}>{on && <Ic.check />}</span>
                      <span className="sd-l">{days[i]}</span>
                    </div>
                  ))}
                </div>
                <p className="streak-note">Reviewed every day this week. Come back tomorrow to keep it alive.</p>
              </div>

              <div className="sum-panel">
                <div className="panel-head">
                  <span className="panel-title">Words matured</span>
                  <span className="panel-meta">+3 known</span>
                </div>
                <ul className="mat-list">
                  {MATURED.map((m) => (
                    <li key={m.w} className="mat">
                      <span className="mat-w jp">{m.w}<span className="mat-r">{m.r}</span></span>
                      <span className="mat-g">{m.g}</span>
                      <span className="mat-badge"><Ic.check /></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* actions */}
            <div className="sum-actions">
              <a className="sum-btn ghost" href="Dashboard.html">Back to home</a>
              <a className="sum-btn primary" href="Player.html">Keep immersing <Ic.arrow /></a>
            </div>

          </div>
        </div>
      </div>

      <TweaksPanel>
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
