/* Fuchine — Dashboard (Home) — the daily starting point, not the Library */
const { useState, useEffect } = React;

/* ---- the one video the user was last studying (drawn from the library) ---- */
const CONTINUE = {
  title: '京都の朝、静かな散歩 — A quiet morning walk in Kyoto',
  chan: '散歩日和チャンネル',
  dur: '14:22', lvl: 3, pct: 38, at: '5:24', when: '2 days ago',
};

const DUE = 23;

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle, due }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', active: true },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html', badge: due },
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
              {it.badge != null && <span className="nav-badge">{it.badge}</span>}
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

/* ---------------- Quick import ---------------- */
function QuickImport() {
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
      <button className="btn-primary" onClick={open}><Ic.plus /> Import</button>
    </div>
  );
}

/* ---------------- Hero — today's reviews ---------------- */
function HeroReviews({ calm, due }) {
  if (calm) {
    return (
      <div className="hero calm">
        <div className="hero-l">
          <span className="hero-check"><Ic.check /></span>
          <div className="hero-copy">
            <p className="t">All caught up — nothing to review</p>
            <p className="s">Your deck is clear. New cards appear as you mine words from videos.</p>
          </div>
        </div>
        <div className="hero-r">
          <button className="btn-ghost" onClick={() => window.location.href = 'Home.html'}>
            <Ic.play /> Find something to watch
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="hero">
      <div className="hero-l">
        <span className="hero-num">{due}</span>
        <div className="hero-copy">
          <p className="t">cards to review today</p>
          <p className="s">Across 4 videos · about 8 minutes</p>
        </div>
      </div>
      <div className="hero-r">
        <button className="btn-primary" onClick={() => window.location.href = 'Review.html'}>
          <Ic.review /> Review now
        </button>
      </div>
    </div>
  );
}

/* ---------------- Continue watching — reuses the Library card language ---------------- */
function ContinueWatching() {
  const go = () => { window.location.href = 'Player.html'; };
  return (
    <section className="section rise-3">
      <div className="section-head"><h2>Continue watching</h2></div>
      <div className="continue">
        <button className="continue-thumb thumb" onClick={go} aria-label={'Resume ' + CONTINUE.title}>
          <span className="lvl">LVL {CONTINUE.lvl}</span>
          <span className="play"><Ic.play /></span>
          <span className="dur">{CONTINUE.dur}</span>
          <span className="wp"><i style={{ width: CONTINUE.pct + '%' }} /></span>
        </button>
        <div className="continue-meta">
          <p className="label">Last watched · {CONTINUE.when}</p>
          <p className="title jp">{CONTINUE.title}</p>
          <p className="chan">{CONTINUE.chan}</p>
          <div className="progress"><i style={{ width: CONTINUE.pct + '%' }} /></div>
          <p className="ptext">Left off at {CONTINUE.at} · {CONTINUE.pct}% complete</p>
        </div>
        <div className="continue-r">
          <button className="btn-primary" onClick={go}><Ic.play /> Resume</button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Secondary jump-offs ---------------- */
function JumpOffs() {
  return (
    <section className="section rise-3">
      <div className="jumps">
        <button className="jump" onClick={() => window.location.href = 'Home.html'}>
          <span className="jump-ic"><Ic.library /></span>
          <span className="jump-text">
            <span className="jump-t">Open library</span>
            <span className="jump-s">Browse everything you've added</span>
          </span>
          <span className="jump-go"><Ic.arrow /></span>
        </button>

        <div className="jump soon">
          <span className="jump-ic"><Ic.stats /></span>
          <span className="jump-text">
            <span className="jump-t">Your stats</span>
            <span className="jump-s">Watch time, words, streaks</span>
          </span>
          <span className="soon-pill">Soon</span>
        </div>

        <div className="jump soon">
          <span className="jump-ic"><Ic.spark /></span>
          <span className="jump-text">
            <span className="jump-t">Recommendations</span>
            <span className="jump-s">Picks from what you watch</span>
          </span>
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

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);

  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const state = t.state; // 'default' | 'nothing-due' | 'first-run'
  const firstRun = state === 'first-run';
  const nothingDue = state === 'nothing-due';

  const sub = nothingDue
    ? "You're all caught up. Pick up where you left off, or bring in something new."
    : 'You have a review waiting, and a video to finish.';

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} due={firstRun ? null : (nothingDue ? null : DUE)} />

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
            <div className="rise-2"><QuickImport /></div>
            <div className="fr-hint rise-3">
              <Ic.spark /> Try a vlog, a news clip, or a cooking video — anything in Japanese works.
            </div>
          </div>
        ) : (
          <div className="content">
            <div className="greet-row rise">
              <div className="greeting">
                <h1>Welcome back, Mai.</h1>
                <p>{sub}</p>
              </div>
            </div>

            <div className="rise-2">
              <HeroReviews calm={nothingDue} due={DUE} />
            </div>

            <ContinueWatching />

            <section className="section rise-3">
              <div className="section-head"><h2>Quick import</h2></div>
              <QuickImport />
            </section>

            <JumpOffs />
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
