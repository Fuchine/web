/* Fuchine — Album detail: one collection, its videos, progress. */
const { useState, useEffect } = React;

const ALBUM = {
  title: 'Slow life vlogs',
  desc: 'Calm everyday vlogs — morning walks, trains, quiet corners of Japan. Gentle pacing, clear speech, great for steady listening.',
  pinned: true,
  cover: ['t1', 't5', 't3', 't2'],
  words: 142,
};

/* videos in this album */
const VIDEOS = [
  { id: 1, title: '京都の朝、静かな散歩 — A quiet morning walk in Kyoto', chan: '散歩日和チャンネル', dur: '14:22', lvl: 3, comp: 62, progress: 100, tone: 't1' },
  { id: 2, title: '東京の電車に乗ってみた — Riding the Tokyo trains', chan: 'Tokyo Days', dur: '11:37', lvl: 3, comp: 55, progress: 100, tone: 't5' },
  { id: 3, title: '渋谷の夜を歩く — Walking Shibuya at night', chan: 'Night Walk Japan', dur: '9:55', lvl: 2, comp: 77, progress: 64, tone: 't4' },
  { id: 4, title: '鴨川のほとりでのんびり過ごす午後', chan: '京都ぐらし', dur: '12:48', lvl: 3, comp: 58, progress: 38, tone: 't3' },
  { id: 5, title: '全国の温泉をめぐる旅 — A trip around the onsen', chan: 'ゆるたび', dur: '22:30', lvl: 4, comp: 43, progress: 0, tone: 't2' },
  { id: 6, title: '北海道の海でとれた魚を料理する', chan: '漁港ごはん', dur: '13:08', lvl: 3, comp: 52, progress: 0, tone: 't6' },
  { id: 7, title: '小さな町のパン屋さんの一日', chan: 'まちの記録', dur: '10:15', lvl: 2, comp: 71, progress: 0, tone: 't1' },
  { id: 8, title: '雨の日の喫茶店でひと休み — A rainy day café', chan: 'teatime talk', dur: '8:40', lvl: 2, comp: 74, progress: 0, tone: 't5' },
];

const NAV = [
  { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
  { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
  { key: 'albums', icon: Ic.albums, label: 'Albums', href: 'Albums.html', active: true },
  { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
  { key: 'dict', icon: Ic.dict, label: 'Dictionary', href: 'Dictionary.html' },
  { key: 'phrases', icon: Ic.phrases, label: 'Phrases', href: 'Phrases.html' },
  { key: 'stats', icon: Ic.stats, label: 'Stats', href: 'Stats.html' },
  { key: 'settings', icon: Ic.settings, label: 'Settings', href: 'Settings.html' },
];

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
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
        {NAV.map((it) => {
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

/* ---------------- Cover mosaic ---------------- */
function Cover({ tiles, empty }) {
  if (empty) {
    return (
      <div className="ad-cover cells-1">
        <div className="ad-cell t3"><span className="ad-cover-glyph"><Ic.albums /></span></div>
      </div>
    );
  }
  const n = Math.min(tiles.length, 4);
  const cells = tiles.slice(0, 4);
  while (cells.length < 4) cells.push(cells[cells.length - 1]);
  return (
    <div className={'ad-cover cells-' + n}>
      {cells.map((c, i) => <div key={i} className={'ad-cell ' + c} />)}
    </div>
  );
}

/* ---------------- Comprehension ring ---------------- */
function CompRing({ pct }) {
  const r = 10, c = 2 * Math.PI * r;
  return (
    <span className="ad-comp" title={'Comprehension ' + pct + '%'}>
      <svg className="ring" viewBox="0 0 26 26">
        <circle className="track" cx="13" cy="13" r={r} />
        <circle className="val" cx="13" cy="13" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="pct">{pct}%</span>
    </span>
  );
}

/* ---------------- Video row ---------------- */
function Row({ v, idx }) {
  const go = () => { window.location.href = 'Player.html'; };
  const status = v.progress >= 100
    ? <span className="ad-vstatus done"><Ic.check /> Watched</span>
    : v.progress > 0
      ? <span className="ad-vstatus going">{v.progress}% watched</span>
      : <span className="ad-vstatus new">Not started</span>;
  return (
    <li className="ad-row">
      <span className="ad-idx">{idx}</span>
      <button className={'ad-thumb ' + v.tone} onClick={go} aria-label={v.title}>
        <span className="lvl">LVL {v.lvl}</span>
        <span className="play"><Ic.play /></span>
        <span className="dur">{v.dur}</span>
        {v.progress > 0 && <span className="wp"><i style={{ width: v.progress + '%' }} /></span>}
      </button>
      <div className="ad-vmeta">
        <span className="ad-vtitle jp">{v.title}</span>
        <span className="ad-vsub">
          {status}
          <span className="dot" style={{ width: 3, height: 3, borderRadius: 9, background: 'var(--border-strong)' }} />
          <span className="ad-chan">{v.chan}</span>
        </span>
      </div>
      <CompRing pct={v.comp} />
      <button className="ad-more" aria-label="More"><Ic.more /></button>
    </li>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "collapsed": false,
  "state": "filled"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  /* hero overflow menu */
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pinned, setPinned] = useState(ALBUM.pinned);
  const [toast, setToast] = useState(null);
  const menuWrapRef = React.useRef(null);
  const closeMenu = () => { setMenuOpen(false); setConfirming(false); };
  const showToast = (msg) => { setToast(msg); };
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) closeMenu(); };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const empty = t.state === 'empty';
  const videos = empty ? [] : VIDEOS;

  const totalSec = videos.reduce((s, v) => { const [m, sec] = v.dur.split(':').map(Number); return s + m * 60 + sec; }, 0);
  const hrs = Math.floor(totalSec / 3600), mins = Math.round((totalSec % 3600) / 60);
  const runtime = hrs ? `${hrs}h ${mins}m` : `${mins}m`;
  const overall = videos.length ? Math.round(videos.reduce((s, v) => s + v.progress, 0) / videos.length) : 0;
  const nextIdx = videos.findIndex((v) => v.progress < 100);

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content ad-content">
          <button className="ad-back rise" onClick={() => { window.location.href = 'Albums.html'; }}>
            <Ic.arrow /> Albums
          </button>

          {/* hero */}
          <header className="ad-hero rise">
            <Cover tiles={ALBUM.cover} empty={empty} />
            <div className="ad-info">
              <div className="ad-kicker"><Ic.albums /> Album</div>
              <div className="ad-title-row">
                <h1 className="ad-title">{ALBUM.title}</h1>
                {pinned && <span className="ad-pin" title="Pinned"><Ic.bookmarkFill /></span>}
              </div>
              <p className="ad-desc">{ALBUM.desc}</p>

              {empty ? (
                <div className="ad-meta"><b>0</b> videos · ready when you are</div>
              ) : (
                <>
                  <div className="ad-meta">
                    <span><b>{videos.length}</b> videos</span><span className="dot" />
                    <span><b>{ALBUM.words}</b> words</span><span className="dot" />
                    <span>{runtime} total</span>
                  </div>
                  <div className="ad-prog">
                    <div className="ad-prog-track"><div className="ad-prog-fill" style={{ width: overall + '%' }} /></div>
                    <span className="ad-prog-pct">{overall}% complete</span>
                  </div>
                </>
              )}

              <div className="ad-actions">
                {empty ? (
                  <button className="ad-btn primary" onClick={() => { window.location.href = 'Home.html'; }}>
                    <Ic.plus /> Add videos
                  </button>
                ) : (
                  <>
                    <button className="ad-btn primary" onClick={() => { window.location.href = 'Player.html'; }}>
                      <Ic.play /> {nextIdx > 0 ? 'Continue' : 'Start watching'}
                    </button>
                    <button className="ad-btn ghost" onClick={() => { window.location.href = 'Home.html'; }}>
                      <Ic.plus /> Add videos
                    </button>
                    <div className="ad-menu-wrap" ref={menuWrapRef}>
                      <button className={'ad-icon' + (menuOpen ? ' on' : '')} title="Album options"
                        aria-haspopup="true" aria-expanded={menuOpen}
                        onClick={() => { setMenuOpen((o) => !o); setConfirming(false); }}>
                        <Ic.more />
                      </button>
                      {menuOpen && (
                        <div className="ad-menu" role="menu">
                          {confirming ? (
                            <div className="ad-confirm">
                              <div className="ad-confirm-t">Remove this album?</div>
                              <p className="ad-confirm-p">The album is deleted, but its {videos.length} videos and your progress stay in your library.</p>
                              <div className="ad-confirm-row">
                                <button onClick={() => setConfirming(false)}>Keep</button>
                                <button className="danger" onClick={() => { closeMenu(); window.location.href = 'Albums.html'; }}>Remove</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button className="ad-mi" role="menuitem" onClick={() => { closeMenu(); window.location.href = 'Player.html'; }}>
                                <Ic.play /><span className="mi-label">Play from start</span>
                              </button>
                              <button className="ad-mi" role="menuitem" onClick={() => { setPinned((p) => !p); closeMenu(); showToast(pinned ? 'Unpinned from top' : 'Pinned to top'); }}>
                                {pinned ? <Ic.bookmark /> : <Ic.bookmarkFill />}
                                <span className="mi-label">{pinned ? 'Unpin from top' : 'Pin to top'}</span>
                              </button>
                              <button className="ad-mi" role="menuitem" onClick={() => { closeMenu(); showToast('Edit details — coming soon'); }}>
                                <Ic.text /><span className="mi-label">Edit details</span>
                              </button>
                              <button className="ad-mi" role="menuitem" onClick={() => { closeMenu(); showToast('Album duplicated'); }}>
                                <Ic.cards /><span className="mi-label">Duplicate album</span>
                              </button>
                              <button className="ad-mi" role="menuitem" onClick={() => { closeMenu(); showToast('Downloading for offline'); }}>
                                <Ic.download /><span className="mi-label">Download offline</span>
                                <span className="mi-tag">Pro</span>
                              </button>
                              <div className="ad-msep" />
                              <button className="ad-mi danger" role="menuitem" onClick={() => setConfirming(true)}>
                                <Ic.close /><span className="mi-label">Remove album</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* video list */}
          {empty ? (
            <div className="ad-empty rise-2">
              <span className="ad-empty-ic"><Ic.albums /></span>
              <h3>No videos in this album yet</h3>
              <p>Add videos from your library to start building this collection. Your progress and mined words will gather here.</p>
              <button className="ad-btn primary" onClick={() => { window.location.href = 'Home.html'; }}>
                <Ic.plus /> Browse library
              </button>
            </div>
          ) : (
            <div className="rise-2">
              <div className="ad-list-head">
                <span className="ad-list-title">Videos<span>{videos.length}</span></span>
                <button className="ad-list-sort"><Ic.sort /> Album order</button>
              </div>
              <ul className="ad-list">
                {videos.map((v, i) => <Row key={v.id} v={v} idx={i + 1} />)}
              </ul>
            </div>
          )}
        </div>
      </main>

      {toast && (
        <div className="ad-toast"><Ic.check /> {toast}</div>
      )}

      <TweaksPanel>
        <TweakSection label="Album state" />
        <TweakRadio label="State" value={t.state}
          options={['filled', 'empty']} onChange={(v) => setTweak('state', v)} />

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
