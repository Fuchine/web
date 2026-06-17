/* Fuchine — Stats (learning analytics) */
const { useState, useEffect } = React;

const KPIS = [
  { k: 'Words known', v: '340', d: '+18', up: true, sub: 'this week' },
  { k: 'Watch time', v: '12.4', u: 'h', d: '+2.1h', up: true, sub: 'this week' },
  { k: 'Day streak', v: '12', d: 'Best: 21', up: null, sub: 'days' },
  { k: 'Retention', v: '88', u: '%', d: '+3%', up: true, sub: '30-day avg' },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const ACTIVITY = [24, 38, 12, 45, 30, 52, 41]; // minutes/day

const VOCAB = [
  { label: 'Known', n: 340, cls: 'known' },
  { label: 'Learning', n: 86, cls: 'learning' },
  { label: 'New', n: 24, cls: 'new' },
];

const TOP = [
  { title: 'Kyoto Slow Living', words: 42, dur: '14:22' },
  { title: 'ニュースで学ぶ日本語', words: 28, dur: '6:48' },
  { title: '簡単な味噌汁の作り方', words: 19, dur: '9:10' },
  { title: 'VLOG：東京の電車に乗ってみた', words: 15, dur: '11:37' },
];

/* deterministic heatmap: 17 weeks x 7 days, intensity 0-4 */
const HEAT = (() => {
  const w = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let c = 0; c < 17; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const x = rnd();
      col.push(x < 0.28 ? 0 : x < 0.5 ? 1 : x < 0.72 ? 2 : x < 0.9 ? 3 : 4);
    }
    w.push(col);
  }
  // keep the latest stretch active (streak)
  for (let c = 14; c < 17; c++) for (let r = 0; r < 7; r++) if (w[c][r] === 0) w[c][r] = 2;
  return w;
})();

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'dict', icon: Ic.dict, label: 'Dictionary', href: 'Dictionary.html' },
    { key: 'phrases', icon: Ic.phrases, label: 'Phrases', href: 'Phrases.html' },
    { key: 'stats', icon: Ic.stats, label: 'Stats', active: true },
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

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "collapsed": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  const [range, setRange] = useState('week');

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const maxAct = Math.max(...ACTIVITY);
  const vocabTotal = VOCAB.reduce((s, v) => s + v.n, 0);
  const maxWords = Math.max(...TOP.map((x) => x.words));

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content st-content">
          <div className="st-head rise">
            <div>
              <h1>Stats</h1>
              <p>Your progress at a glance — watch time, vocabulary, and review consistency.</p>
            </div>
            <div className="seg st-range">
              {[{v:'week',l:'Week'},{v:'month',l:'Month'},{v:'year',l:'Year'}].map((o) => (
                <button key={o.v} className={'seg-b' + (range === o.v ? ' on' : '')} onClick={() => setRange(o.v)}>{o.l}</button>
              ))}
            </div>
          </div>

          {/* KPI cards */}
          <div className="st-kpis rise-2">
            {KPIS.map((kp) => (
              <div className="kpi" key={kp.k}>
                <div className="kpi-k">{kp.k}</div>
                <div className="kpi-v">{kp.v}{kp.u && <span className="kpi-u">{kp.u}</span>}</div>
                <div className={'kpi-d' + (kp.up === true ? ' up' : kp.up === false ? ' down' : '')}>
                  {kp.up === true && <Ic.arrow />}{kp.d} <span className="kpi-sub">· {kp.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* activity + vocab */}
          <div className="st-grid rise-3">
            <div className="st-card">
              <div className="st-ch">
                <span className="st-title">Daily watch time</span>
                <span className="st-meta">This week · {ACTIVITY.reduce((a,b)=>a+b,0)} min</span>
              </div>
              <div className="bars">
                {ACTIVITY.map((m, i) => (
                  <div className="bar-col" key={i}>
                    <div className="bar-track">
                      <div className={'bar-fill' + (i === 5 ? ' peak' : '')} style={{ height: (m / maxAct * 100) + '%' }}>
                        <span className="bar-val">{m}</span>
                      </div>
                    </div>
                    <span className="bar-day">{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="st-card">
              <div className="st-ch">
                <span className="st-title">Vocabulary</span>
                <span className="st-meta">{vocabTotal} tracked</span>
              </div>
              <div className="vbar">
                {VOCAB.map((v) => (
                  <div key={v.label} className={'vseg ' + v.cls} style={{ flexGrow: v.n }} title={`${v.label} · ${v.n}`} />
                ))}
              </div>
              <div className="vlegend">
                {VOCAB.map((v) => (
                  <div key={v.label} className="vleg">
                    <span className={'vdot ' + v.cls} />
                    <span className="vleg-l">{v.label}</span>
                    <span className="vleg-n">{v.n}</span>
                  </div>
                ))}
              </div>
              <div className="vnote"><Ic.spark /> 18 words moved to <b>Known</b> this week.</div>
            </div>
          </div>

          {/* review heatmap */}
          <div className="st-card rise-3">
            <div className="st-ch">
              <span className="st-title">Review consistency</span>
              <span className="st-meta">Last 17 weeks · 12-day streak</span>
            </div>
            <div className="heat">
              <div className="heat-days">
                <span>Mon</span><span>Wed</span><span>Fri</span>
              </div>
              <div className="heat-grid">
                {HEAT.map((col, c) => (
                  <div className="heat-col" key={c}>
                    {col.map((lvl, r) => (
                      <span key={r} className={'heat-cell l' + lvl} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="heat-legend">
              <span>Less</span>
              {[0,1,2,3,4].map((l) => <span key={l} className={'heat-cell l' + l} />)}
              <span>More</span>
            </div>
          </div>

          {/* top videos */}
          <div className="st-card rise-3">
            <div className="st-ch">
              <span className="st-title">Top sources by words mined</span>
            </div>
            <div className="top-list">
              {TOP.map((v, i) => (
                <div className="top-row" key={i}>
                  <span className="top-rank">{i + 1}</span>
                  <div className="top-meta">
                    <span className="top-title jp">{v.title}</span>
                    <span className="top-sub">{v.dur}</span>
                  </div>
                  <div className="top-track"><div className="top-fill" style={{ width: (v.words / maxWords * 100) + '%' }} /></div>
                  <span className="top-words"><b>{v.words}</b> words</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <TweaksPanel>
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
