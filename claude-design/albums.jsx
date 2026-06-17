/* Fuchine — Albums (video collections) */
const { useState, useEffect } = React;

const ALBUMS = [
  { id: 1, title: 'Slow life vlogs', videos: 8, words: 142, pct: 64, tiles: ['c1','c2','c3','c4'], pinned: true },
  { id: 2, title: 'News & weather', videos: 5, words: 88, pct: 30, tiles: ['c2','c4','c1'] },
  { id: 3, title: 'Cooking & recipes', videos: 6, words: 96, pct: 80, tiles: ['c3','c1','c2','c4'] },
  { id: 4, title: 'JLPT N4 grammar', videos: 12, words: 210, pct: 45, tiles: ['c4','c3','c2','c1'] },
  { id: 5, title: 'Travel & places', videos: 4, words: 52, pct: 12, tiles: ['c1','c3'] },
  { id: 6, title: 'Interviews', videos: 3, words: 40, pct: 0, tiles: ['c2','c4','c3'], fresh: true },
];

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'albums', icon: Ic.albums, label: 'Albums', active: true },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'dict', icon: Ic.dict, label: 'Dictionary', href: 'Dictionary.html' },
    { key: 'phrases', icon: Ic.phrases, label: 'Phrases', href: 'Phrases.html' },
    { key: 'stats', icon: Ic.stats, label: 'Stats', href: 'Stats.html' },
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

function Cover({ tiles, videos }) {
  // fill to 4 cells for the mosaic
  const cells = tiles.slice(0, 4);
  while (cells.length < 4) cells.push(cells[cells.length - 1]);
  return (
    <div className={'alb-cover cells-' + Math.min(tiles.length, 4)}>
      {cells.map((c, i) => (
        <div key={i} className={'alb-tile ' + c}>
          {i === 0 && <span className="alb-play"><Ic.play /></span>}
        </div>
      ))}
      <span className="alb-count"><Ic.albums /> {videos}</span>
    </div>
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

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const totalVids = ALBUMS.reduce((s, a) => s + a.videos, 0);

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content alb-content">
          <div className="alb-head rise">
            <div>
              <h1>Albums</h1>
              <p>{ALBUMS.length} collections · {totalVids} videos organized</p>
            </div>
            <button className="btn-primary"><Ic.folderPlus /> New album</button>
          </div>

          <div className="alb-grid rise-2">
            {/* new album tile */}
            <button className="alb-new">
              <span className="alb-new-ic"><Ic.plus /></span>
              <span className="alb-new-t">New album</span>
              <span className="alb-new-s">Group videos by theme or goal</span>
            </button>

            {ALBUMS.map((a) => (
              <div className="alb-card" key={a.id}>
                <Cover tiles={a.tiles} videos={a.videos} />
                <div className="alb-meta">
                  <div className="alb-titlerow">
                    <span className="alb-title">{a.title}</span>
                    {a.pinned && <span className="alb-pin" title="Pinned"><Ic.bookmarkFill /></span>}
                    {a.fresh && <span className="alb-fresh">New</span>}
                  </div>
                  <div className="alb-sub">{a.videos} videos · {a.words} words</div>
                  <div className="alb-prog">
                    <div className="alb-track"><div className="alb-fill" style={{ width: a.pct + '%' }} /></div>
                    <span className="alb-pct">{a.pct}%</span>
                  </div>
                </div>
              </div>
            ))}
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
