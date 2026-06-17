/* Fuchine — Dashboard (home) */
const { useState, useEffect } = React;

/* ---- sample content (Japanese appears only as real video titles) ---- */
const LIBRARY = [
  { id: 1, title: '京都の朝、静かな散歩 — A quiet morning walk in Kyoto', dur: '14:22', status: 'progress' },
  { id: 2, title: 'ニュースで学ぶ日本語：今日の天気予報', dur: '6:48', status: 'new' },
  { id: 3, title: '簡単な味噌汁の作り方 — How to make miso soup', dur: '9:10', status: 'studied' },
  { id: 4, title: 'インタビュー：アニメーションと仕事について', dur: '23:05', status: 'new' },
  { id: 5, title: 'VLOG：東京の電車に乗ってみた', dur: '11:37', status: 'studied' },
];
const CONTINUE = {
  title: '京都の朝、静かな散歩 — A quiet morning walk in Kyoto',
  dur: '14:22', pct: 38, at: '5:24',
};
const BADGE = {
  new:      { cls: 'new', label: 'New' },
  progress: { cls: 'progress-b', label: 'In progress' },
  studied:  { cls: 'studied', label: 'Studied' },
};

const Thumb = ({ dur }) => (
  <div className="thumb">
    <span className="play"><Ic.play /></span>
    {dur && <span className="dur">{dur}</span>}
  </div>
);

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', active: true },
    { key: 'library', icon: Ic.library, label: 'Library' },
    { key: 'review', icon: Ic.review, label: 'Review' },
    { key: 'settings', icon: Ic.settings, label: 'Settings' },
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
              title={collapsed ? it.label : undefined}>
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

/* ---------------- Add-a-video field ---------------- */
function AddVideo({ big }) {
  const [v, setV] = useState('');
  const open = () => { window.location.href = 'Import.html'; };
  return (
    <div className="add-row">
      <div className="add-field">
        <Ic.youtube className="yt" />
        <input className="add-input" value={v} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
          placeholder="Paste a YouTube link to study" />
      </div>
      <button className="btn-primary" onClick={open}><Ic.plus /> Add</button>
    </div>
  );
}

/* ---------------- Sections ---------------- */
function Stats() {
  return (
    <div className="stats">
      <div className="stat"><span className="v">12.4<small>h</small></span><span className="k">Watched</span></div>
      <span className="stat-div" />
      <div className="stat"><span className="v">340</span><span className="k">Words learned</span></div>
      <span className="stat-div" />
      <div className="stat"><span className="v">7<small>d</small></span><span className="k">Streak</span></div>
    </div>
  );
}

function HeroReviews({ calm }) {
  if (calm) {
    return (
      <div className="hero calm rise-2">
        <div className="hero-l">
          <span className="hero-check"><Ic.check /></span>
          <div className="hero-copy">
            <p className="t">Nothing to review right now</p>
            <p className="s">You're all caught up. How about watching something?</p>
          </div>
        </div>
        <div className="hero-r">
          <button className="btn-ghost"><Ic.play /> Find something to watch</button>
        </div>
      </div>
    );
  }
  return (
    <div className="hero rise-2">
      <div className="hero-l">
        <span className="hero-num">23</span>
        <div className="hero-copy">
          <p className="t">cards to review today</p>
          <p className="s">Across 4 videos · about 8 minutes</p>
        </div>
      </div>
      <div className="hero-r">
        <button className="btn-primary"><Ic.review /> Review now</button>
      </div>
    </div>
  );
}

function ContinueWatching() {
  return (
    <section className="section rise-3">
      <div className="section-head"><h2>Continue watching</h2></div>
      <div className="continue">
        <div className="thumb" style={{ position: 'relative' }}>
          <span className="play"><Ic.play /></span>
          <span className="dur">{CONTINUE.dur}</span>
        </div>
        <div className="continue-meta">
          <p className="label">Last watched</p>
          <p className="title jp">{CONTINUE.title}</p>
          <div className="progress"><i style={{ width: CONTINUE.pct + '%' }} /></div>
          <p className="ptext">{CONTINUE.at} of {CONTINUE.dur} · {CONTINUE.pct}%</p>
        </div>
        <div className="continue-r">
          <button className="btn-primary"><Ic.play /> Continue</button>
        </div>
      </div>
    </section>
  );
}

function YourVideos() {
  return (
    <section className="section rise-3">
      <div className="section-head">
        <h2>Your videos</h2>
        <button className="more">Open library</button>
      </div>
      <div className="vid-row">
        {LIBRARY.map((v) => {
          const b = BADGE[v.status];
          return (
            <button className="vid-card" key={v.id}>
              <Thumb dur={v.dur} />
              <p className="v-title jp">{v.title}</p>
              <span className={'badge ' + b.cls}><i />{b.label}</span>
            </button>
          );
        })}
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="reco">
          <span className="ico"><Ic.spark /></span>
          <div>
            <p className="r-t">Recommended for you</p>
            <p className="r-s">Personalized picks based on what you watch — arriving soon.</p>
          </div>
          <span className="soon-pill">Soon</span>
        </div>
      </div>
    </section>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "default",
  "collapsed": false
}/*EDITMODE-END*/;

const HOUR = new Date().getHours();
const GREETING = HOUR < 12 ? 'Good morning' : HOUR < 18 ? 'Good afternoon' : 'Good evening';

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);

  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const state = t.state; // 'default' | 'nothing-due' | 'first-run'
  const firstRun = state === 'first-run';

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        {firstRun ? (
          <div className="content firstrun">
            <div className="rise">
              <div className="fr-mark">淵</div>
              <h1>Welcome to Fuchine, Mai.</h1>
              <p className="fr-sub">
                Learn Japanese by watching what you love. Paste any YouTube video
                and we'll turn it into a study session — subtitles, a dictionary, and review built in.
              </p>
            </div>
            <div className="rise-2"><AddVideo big /></div>
            <div className="fr-hint rise-3">
              <Ic.spark /> Try a vlog, a news clip, or a cooking video — anything in Japanese works.
            </div>
          </div>
        ) : (
          <div className="content">
            <div className="greet-row rise">
              <div className="greeting">
                <h1>{GREETING}, Mai.</h1>
                <p>Two things waiting today — a review, and a video to finish.</p>
              </div>
              <Stats />
            </div>

            <HeroReviews calm={state === 'nothing-due'} />

            <ContinueWatching />

            <section className="section rise-3">
              <div className="section-head"><h2>Add a video</h2></div>
              <AddVideo />
            </section>

            <YourVideos />
          </div>
        )}
      </main>

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
        <TweakToggle label="Collapse sidebar" value={collapsed}
          onChange={(v) => { setCollapsed(v); setTweak('collapsed', v); }} />

        <TweakSection label="Screen state" />
        <TweakRadio label="State" value={t.state}
          options={['default', 'nothing-due', 'first-run']}
          onChange={(v) => setTweak('state', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
