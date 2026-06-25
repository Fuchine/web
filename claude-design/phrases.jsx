/* Fuchine — Phrases (mined sentences library) */
const { useState, useEffect, useRef } = React;

/* ja = sentence parts; idx 'hl' marks the target word; r = its reading */
const PHRASES = [
  { id: 1, status: 'due', pre: '毎朝川沿いを', hl: '歩いて', r: 'あるいて', post: 'います。',
    en: 'Every morning, I walk along the river.', src: 'Kyoto Slow Living', time: '5:24', mined: '2 days ago' },
  { id: 2, status: 'due', pre: '空気がとても', hl: '澄んで', r: 'すんで', post: 'いて、気持ちがいいですね。',
    en: 'The air is so clear — it feels wonderful.', src: 'Kyoto Slow Living', time: '5:31', mined: '2 days ago' },
  { id: 3, status: 'learning', pre: '散歩には', hl: '最適', r: 'さいてき', post: 'です。',
    en: "It's perfect for a walk.", src: 'Kyoto Slow Living', time: '5:38', mined: '3 days ago' },
  { id: 4, status: 'new', pre: '今日の天気を', hl: '確認', r: 'かくにん', post: 'しましょう。',
    en: "Let's check today's weather.", src: 'ニュースで学ぶ日本語', time: '1:02', mined: 'Today' },
  { id: 5, status: 'learning', pre: 'お味噌を', hl: '溶かして', r: 'とかして', post: 'ください。',
    en: 'Please dissolve the miso.', src: '簡単な味噌汁の作り方', time: '3:45', mined: '5 days ago' },
  { id: 6, status: 'known', pre: '向こうに見えるのは、有名な', hl: 'お寺', r: 'おてら', post: 'です。',
    en: 'What you can see over there is a famous temple.', src: 'Kyoto Slow Living', time: '5:45', mined: '1 week ago' },
  { id: 7, status: 'known', pre: '電車に', hl: '乗って', r: 'のって', post: 'みました。',
    en: 'I tried riding the train.', src: 'VLOG：東京の電車', time: '0:38', mined: '1 week ago' },
];

const STATUS = {
  new:      { cls: 'new', label: 'New' },
  learning: { cls: 'learning', label: 'Learning' },
  due:      { cls: 'due', label: 'Due' },
  known:    { cls: 'known', label: 'Known' },
};

const FILTERS = [
  { v: 'all', l: 'All' },
  { v: 'due', l: 'Due' },
  { v: 'learning', l: 'Learning' },
  { v: 'new', l: 'New' },
  { v: 'known', l: 'Known' },
];

const SORTS = [
  { v: 'recent', l: 'Recently mined' },
  { v: 'oldest', l: 'Oldest first' },
  { v: 'status', l: 'By status' },
  { v: 'az', l: 'Alphabetical' },
];
const STATUS_ORDER = { due: 0, learning: 1, new: 2, known: 3 };
const MINED_ORDER = { 'Today': 0, '2 days ago': 1, '3 days ago': 2, '5 days ago': 3, '1 week ago': 4 };

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'dict', icon: Ic.dict, label: 'Dictionary', href: 'Dictionary.html' },
    { key: 'phrases', icon: Ic.phrases, label: 'Phrases', active: true },
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
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [removed, setRemoved] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const sortRef = useRef(null);

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  useEffect(() => {
    if (!sortOpen && menuId === null) return;
    const onDown = (e) => {
      if (sortRef.current && sortRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.ph-menu-wrap')) return;
      setSortOpen(false); setMenuId(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') { setSortOpen(false); setMenuId(null); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [sortOpen, menuId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const sortLabel = SORTS.find((s) => s.v === sort).l;
  const q = query.trim().toLowerCase();

  const counts = PHRASES.reduce((a, p) => { if (removed.has(p.id)) return a; a[p.status] = (a[p.status] || 0) + 1; return a; }, {});
  let list = PHRASES.filter((p) => {
    if (removed.has(p.id)) return false;
    if (filter !== 'all' && p.status !== filter) return false;
    if (q) {
      const hay = (p.pre + p.hl + p.post + ' ' + p.r + ' ' + p.en + ' ' + p.src).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list = [...list].sort((a, b) => {
    if (sort === 'recent') return (MINED_ORDER[a.mined] ?? 9) - (MINED_ORDER[b.mined] ?? 9);
    if (sort === 'oldest') return (MINED_ORDER[b.mined] ?? 9) - (MINED_ORDER[a.mined] ?? 9);
    if (sort === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (sort === 'az') return (a.pre + a.hl).localeCompare(b.pre + b.hl, 'ja');
    return 0;
  });

  const onCardAction = (action, p) => {
    setMenuId(null);
    if (action === 'review') window.location.href = 'Review.html';
    else if (action === 'video') window.location.href = 'Player.html';
    else if (action === 'edit') setToast({ msg: 'Edit card — coming soon' });
    else if (action === 'reset') setToast({ msg: 'Card progress reset to New' });
    else if (action === 'remove') {
      setRemoved((s) => new Set(s).add(p.id));
      setToast({ msg: 'Phrase removed', undo: () => setRemoved((s) => { const n = new Set(s); n.delete(p.id); return n; }) });
    }
  };

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content ph-content">
          <div className="ph-head rise">
            <div className="ph-titles">
              <h1>Phrases</h1>
              <p>{PHRASES.length} sentences mined from your videos · {counts.due || 0} due today</p>
            </div>
            <a className="btn-primary" href="Review.html"><Ic.review /> Review due</a>
          </div>

          <div className="ph-toolbar rise-2">
            <div className="ph-filters">
              {FILTERS.map((f) => {
                const n = f.v === 'all' ? PHRASES.length : (counts[f.v] || 0);
                return (
                  <button key={f.v} className={'ph-chip' + (filter === f.v ? ' on' : '')}
                    onClick={() => setFilter(f.v)}>
                    {f.l}<span className="ph-chip-n">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="ph-tools">
              <div className="ph-search">
                <Ic.search /><input placeholder="Search phrases…" value={query}
                  onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="ph-pop-wrap" ref={sortRef}>
                <button className={'ph-sort' + (sortOpen ? ' on' : '')} onClick={() => { setSortOpen((o) => !o); setMenuId(null); }}>
                  <Ic.sort /> {sortLabel}
                </button>
                {sortOpen && (
                  <div className="ph-pop">
                    {SORTS.map((s) => (
                      <button key={s.v} className="ph-mi" onClick={() => { setSort(s.v); setSortOpen(false); }}>
                        <Ic.sort /><span className="mi-label">{s.l}</span>
                        {sort === s.v && <span className="mi-check"><Ic.check /></span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ph-list rise-3">
            {list.length === 0 ? (
              <div className="ph-empty">
                <span className="ee-ic"><Ic.search /></span>
                <h3>No phrases here</h3>
                <p>{q ? 'Try a different search term.' : 'Mine sentences while watching to build this list.'}</p>
              </div>
            ) : list.map((p) => {
              const st = STATUS[p.status];
              return (
                <div className="ph-card" key={p.id}>
                  <span className={'ph-badge ' + st.cls}><i />{st.label}</span>
                  <div className="ph-body">
                    <a className="ph-ja jp" href="Player.html">
                      {p.pre}
                      <ruby className="hl">{p.hl}<rt>{p.r}</rt></ruby>
                      {p.post}
                    </a>
                    <div className="ph-en">{p.en}</div>
                    <div className="ph-foot">
                      <a className="ph-src" href="Player.html"><Ic.youtube /> <span className="jp">{p.src}</span> · {p.time}</a>
                      <span className="ph-dot" />
                      <span className="ph-mined">Mined {p.mined}</span>
                    </div>
                  </div>
                  <div className="ph-actions">
                    <button className="ph-act" title="Play clip"
                      onClick={() => setToast({ msg: 'Playing clip · ' + p.time })}><Ic.play /></button>
                    <div className="ph-menu-wrap ph-pop-wrap">
                      <button className={'ph-act' + (menuId === p.id ? ' on' : '')} title="More"
                        onClick={() => { setMenuId(menuId === p.id ? null : p.id); setSortOpen(false); }}><Ic.more /></button>
                      {menuId === p.id && (
                        <div className="ph-pop">
                          <button className="ph-mi" onClick={() => onCardAction('review', p)}><Ic.review /><span className="mi-label">Review now</span></button>
                          <button className="ph-mi" onClick={() => onCardAction('video', p)}><Ic.youtube /><span className="mi-label">Open in video</span></button>
                          <button className="ph-mi" onClick={() => onCardAction('edit', p)}><Ic.text /><span className="mi-label">Edit card</span></button>
                          <button className="ph-mi" onClick={() => onCardAction('reset', p)}><Ic.refresh /><span className="mi-label">Reset progress</span></button>
                          <div className="ph-msep" />
                          <button className="ph-mi danger" onClick={() => onCardAction('remove', p)}><Ic.close /><span className="mi-label">Remove phrase</span></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {toast && (
        <div className="ph-toast">
          <Ic.check /> {toast.msg}
          {toast.undo && <button className="toast-undo" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>}
        </div>
      )}

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
