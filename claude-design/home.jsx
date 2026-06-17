/* ============================================================
   Fuchine — Videos (Home hub)
   A calm, browsable video library: discovery energy, indigo restraint.
   ============================================================ */
const { useState, useEffect, useRef } = React;

/* ---- categories (quiet tabs) ---- */
const CATEGORIES = [
  'All', 'Gaming', 'Music', 'Variety', 'VTuber', 'Vlog',
  'How-to/DIY', 'Education', 'Anime/Manga', 'Movies/Dramas',
  'Food', 'Beauty/Fashion', 'News',
];

/* ---- sample library (Japanese appears only as real video titles) ---- */
const VIDEOS = [
  { id: 1,  cat: 'Vlog',          title: '京都の朝、静かな散歩 — A quiet morning walk in Kyoto', chan: '散歩日和チャンネル', dur: '14:22', lvl: 3, comp: 62, tone: '',   progress: 38, mine: false },
  { id: 2,  cat: 'News',          title: 'ニュースで学ぶ日本語：今日の天気予報',                  chan: 'NHK やさしい日本語',  dur: '6:48',  lvl: 2, comp: 81, tone: 't2', mine: false },
  { id: 3,  cat: 'Food',          title: '簡単な味噌汁の作り方 — How to make miso soup',          chan: 'だいどころ Kitchen',  dur: '9:10',  lvl: 2, comp: 74, tone: 't3', mine: false },
  { id: 4,  cat: 'Education',     title: 'インタビュー：アニメーションの仕事について',             chan: '創作のしごと',        dur: '23:05', lvl: 5, comp: 28, tone: 't4', mine: false },
  { id: 5,  cat: 'Vlog',          title: '東京の電車に乗ってみた — Riding the Tokyo trains',       chan: 'Tokyo Days',          dur: '11:37', lvl: 3, comp: 55, tone: 't5', progress: 64, mine: false },
  { id: 6,  cat: 'Gaming',        title: '【実況】のんびりレトロゲームを遊ぶ',                     chan: 'ぽけっとげーむ',      dur: '18:40', lvl: 4, comp: 41, tone: 't6', mine: false },
  { id: 7,  cat: 'Music',         title: 'アコースティックギターで弾く秋の歌',                    chan: '音の庭',              dur: '8:02',  lvl: 3, comp: 67, tone: '',   mine: false },
  { id: 8,  cat: 'Variety',       title: '雑談しながらお茶を淹れる — Chatting over tea',           chan: 'teatime talk',        dur: '27:18', lvl: 4, comp: 36, tone: 't2', mine: false },
  { id: 9,  cat: 'How-to/DIY',    title: '新しいスマホを開封レビュー — Unboxing a new phone',      chan: 'ガジェット日記',      dur: '12:55', lvl: 3, comp: 58, tone: 't3', progress: 47, mine: false },
  { id: 10, cat: 'VTuber',        title: '【Vtuber】はじめましての自己紹介',                       chan: '星宮あおい',          dur: '15:30', lvl: 4, comp: 44, tone: 't4', mine: true },
  { id: 11, cat: 'Anime/Manga',   title: '漫画の描き方：ペン入れの基本 — Inking basics',           chan: 'えんぴつ先生',        dur: '19:12', lvl: 4, comp: 39, tone: 't5', mine: false },
  { id: 12, cat: 'Movies/Dramas', title: '映画レビュー：静かな名作たち',                           chan: 'シネマの隅で',        dur: '21:47', lvl: 5, comp: 31, tone: 't6', mine: false },
  { id: 13, cat: 'Beauty/Fashion',title: '休日のための簡単メイク — Easy makeup for a day out',     chan: "mayu's room",         dur: '10:24', lvl: 2, comp: 70, tone: '',   mine: false },
  { id: 14, cat: 'Food',          title: '北海道の海でとれた魚を料理する',                         chan: '漁港ごはん',          dur: '13:08', lvl: 3, comp: 52, tone: 't2', mine: true },
  { id: 15, cat: 'How-to/DIY',    title: '部屋の模様替えと収納のコツ — Rearranging a room',        chan: 'すっきり暮らし',      dur: '16:33', lvl: 3, comp: 60, tone: 't3', mine: false },
  { id: 16, cat: 'Education',     title: '数学の小さな話：素数のふしぎ — The wonder of primes',    chan: 'まなびの森',          dur: '12:01', lvl: 5, comp: 33, tone: 't4', mine: false },
  { id: 17, cat: 'Vlog',          title: '渋谷の夜を歩く — Walking Shibuya at night',              chan: 'Night Walk Japan',    dur: '9:55',  lvl: 2, comp: 77, tone: 't5', progress: 21, mine: false },
  { id: 18, cat: 'Music',         title: 'ピアノで弾く映画音楽 — Film music on piano',             chan: 'piano hibi',          dur: '7:40',  lvl: 3, comp: 64, tone: 't6', mine: false },
  { id: 19, cat: 'News',          title: '週末のニュースまとめ — Weekend news roundup',            chan: 'まいにちニュース',    dur: '8:26',  lvl: 2, comp: 79, tone: '',   mine: true },
  { id: 20, cat: 'Gaming',        title: 'ゲーム実況：のんびり街づくり — Relaxed city building',    chan: 'まったりゲームズ',    dur: '24:10', lvl: 4, comp: 47, tone: 't2', mine: true },
  { id: 21, cat: 'Variety',       title: '全国の温泉をめぐる旅 — A trip around the onsen',         chan: 'ゆるたび',            dur: '22:30', lvl: 4, comp: 43, tone: 't3', mine: false },
  { id: 22, cat: 'Beauty/Fashion',title: '古着でつくる秋コーデ — Autumn looks from vintage',       chan: 'furugi days',         dur: '11:18', lvl: 3, comp: 56, tone: 't4', mine: false },
];

const SORTS = [
  { key: 'comp',   label: 'Most comprehensible' },
  { key: 'newest', label: 'Recently added' },
  { key: 'short',  label: 'Shortest first' },
  { key: 'level',  label: 'Level: low to high' },
];

const toSec = (d) => { const [m, s] = d.split(':').map(Number); return m * 60 + s; };

/* ---------------- Comprehension indicator ---------------- */
function CompRing({ pct, mode }) {
  const r = 9, c = 2 * Math.PI * r;
  const asText = mode === 'label';
  return (
    <span className={'comp' + (asText ? ' as-text' : '')} title={`Comprehension ${pct}%`}>
      <svg className="ring" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="track" cx="12" cy="12" r={r} />
        <circle className="val" cx="12" cy="12" r={r}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="ctext">
        {asText ? <>Comprehension <b>{pct}%</b></> : <b>{pct}%</b>}
      </span>
    </span>
  );
}

/* ---------------- Video card (the key component) ---------------- */
function VideoCard({ v, compMode, openMenu, setOpenMenu }) {
  const open = openMenu === v.id;
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);
  const go = () => { window.location.href = 'Player.html'; };
  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpenMenu(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(12, r.right - 196) });
    setOpenMenu(v.id);
  };
  useEffect(() => {
    if (!open) return;
    const scroller = document.querySelector('.main');
    const onScroll = () => setOpenMenu(null);
    scroller && scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller && scroller.removeEventListener('scroll', onScroll);
  }, [open]);
  return (
    <div className="card">
      <button className="card-thumb-btn" onClick={go} aria-label={v.title}>
        <div className={'thumb ' + v.tone}>
          <span className="lvl">LVL {v.lvl}</span>
          <span className="play"><Ic.play /></span>
          <span className="dur">{v.dur}</span>
          {v.progress != null && (
            <span className="wp"><i style={{ width: v.progress + '%' }} /></span>
          )}
        </div>
      </button>
      <div className="card-meta">
        <p className="card-title jp">{v.title}</p>
        <p className="card-chan">{v.chan}</p>
      </div>
      <div className="card-foot">
        <CompRing pct={v.comp} mode={compMode} />
        <span className="card-spacer" />
        <button ref={btnRef} className={'overflow-btn' + (open ? ' open' : '')}
          onClick={toggle} aria-label="More actions">
          <Ic.more />
        </button>
        {open && pos && ReactDOM.createPortal(
          <div className="card-menu" onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto', bottom: 'auto' }}>
            <button className="mi"><Ic.folderPlus /> Add to album</button>
            <button className="mi"><Ic.bookmark /> Save for later</button>
            <button className="mi"><Ic.eyeOff /> Hide video</button>
            <div className="mi-div" />
            <button className="mi"><Ic.flag /> Not interested</button>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle, dueCount }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', active: true },
    { key: 'review', icon: Ic.review, label: 'Review', badge: dueCount },
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
              <I />
              <span className="nav-text">{it.label}</span>
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

/* ---------------- Top bar ---------------- */
function StatBar() {
  return (
    <div className="statbar">
      <span className="s-item"><b>12.4</b> hours watched</span>
      <span className="s-dot" />
      <span className="s-item"><b>340</b> words learned</span>
      <span className="s-dot" />
      <span className="s-item"><b>7</b> day streak</span>
    </div>
  );
}

function TopBar({ showStats, query, setQuery, sort, setSort, mine, setMine, onAdd }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!filterOpen) return;
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [filterOpen]);

  return (
    <div className="tb-top">
      <div className="tb-title-wrap">
        <h1>Videos</h1>
        {showStats && <StatBar />}
      </div>
      <div className="tb-controls">
        <div className="search">
          <Ic.search />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search videos" aria-label="Search videos" />
        </div>

        <div className="pop-wrap" ref={wrapRef}>
          <button className={'icon-btn' + (sort !== 'comp' ? ' on' : '')}
            onClick={() => setFilterOpen((o) => !o)}>
            <Ic.filter /> Filter
          </button>
          {filterOpen && (
            <div className="popover">
              <div className="pop-label">Sort by</div>
              {SORTS.map((s) => (
                <button key={s.key}
                  className={'pop-item' + (sort === s.key ? ' sel' : '')}
                  onClick={() => { setSort(s.key); setFilterOpen(false); }}>
                  <Ic.sort /> {s.label}
                  <span className="pop-check"><Ic.check /></span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className={'icon-btn' + (mine ? ' on' : '')}
          onClick={() => setMine((m) => !m)} aria-pressed={mine}>
          {mine ? <span className="mi-dot" /> : <Ic.download />} My Imports
        </button>

        <button className="btn-add" onClick={onAdd}>
          <Ic.plus /> Add video
        </button>
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */
function Tabs({ active, onPick }) {
  return (
    <div className="tabs" role="tablist">
      {CATEGORIES.map((c) => (
        <button key={c} role="tab" aria-selected={active === c}
          className={'tab' + (active === c ? ' active' : '')}
          onClick={() => onPick(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Rows + grid ---------------- */
function CardRow({ title, sub, items, compMode, openMenu, setOpenMenu, more }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}{sub && <span className="sub">{sub}</span>}</h2>
        {more && <button className="more">{more}</button>}
      </div>
      <div className="row">
        {items.map((v) => (
          <div className="card-cell" key={v.id} style={{ flex: 'none' }}>
            <VideoCard v={v} compMode={compMode} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Add-video modal ---------------- */
function AddModal({ onClose }) {
  const [v, setV] = useState('');
  const go = () => { window.location.href = 'Import.html'; };
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="hmark"><Ic.youtube /></span>
          <span className="htitle">Add a video</span>
          <button className="hclose" aria-label="Close" onClick={onClose}><Ic.close /></button>
        </div>
        <div className="modal-body">
          <p className="paste-label">Paste a link to any Japanese YouTube video and we'll prepare it for study.</p>
          <div className="paste-field">
            <Ic.youtube className="yt" />
            <input className="paste-input" autoFocus value={v} onChange={(e) => setV(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
              placeholder="Paste a YouTube link" />
          </div>
          <div className="modal-foot">
            <button className="btn-primary btn-block" onClick={go}>Import</button>
          </div>
          <p className="paste-eg"><Ic.spark /> Works with vlogs, news, cooking, gaming — anything in Japanese.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "default",
  "collapsed": false,
  "comprehension": "ring",
  "showStats": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  const [cat, setCat] = useState('All');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('comp');
  const [mine, setMine] = useState(false);
  const [modal, setModal] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  useEffect(() => {
    const close = (e) => {
      if (e.target.closest && e.target.closest('.overflow-btn, .card-menu')) return;
      setOpenMenu(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const toggleSidebar = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const firstRun = t.state === 'first-run';
  const q = query.trim().toLowerCase();

  // filtered + sorted main list
  let list = VIDEOS.filter((v) => {
    if (cat !== 'All' && v.cat !== cat) return false;
    if (mine && !v.mine) return false;
    if (q && !(v.title.toLowerCase().includes(q) || v.chan.toLowerCase().includes(q) || v.cat.toLowerCase().includes(q))) return false;
    return true;
  });
  list = [...list].sort((a, b) => {
    if (sort === 'comp') return b.comp - a.comp;
    if (sort === 'newest') return b.id - a.id;
    if (sort === 'short') return toSec(a.dur) - toSec(b.dur);
    if (sort === 'level') return a.lvl - b.lvl;
    return 0;
  });

  const browsing = cat === 'All' && !mine && !q;   // show discovery rows only on the clean default
  const continueList = VIDEOS.filter((v) => v.progress != null).sort((a, b) => b.progress - a.progress);
  const compList = [...VIDEOS].sort((a, b) => b.comp - a.comp).slice(0, 7);

  const gridHeading = mine ? 'My imports'
    : q ? `Results for “${query.trim()}”`
    : cat === 'All' ? 'All videos'
    : cat;
  const gridSub = mine ? `${list.length} of your imports`
    : q ? `${list.length} found`
    : `${list.length} videos`;

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} dueCount={23} />

      <main className="main">
        {firstRun ? (
          <FirstRun onAdd={() => setModal(true)} />
        ) : (
          <>
            <div className="topbar">
              <TopBar showStats={t.showStats} query={query} setQuery={setQuery}
                sort={sort} setSort={setSort} mine={mine} setMine={setMine}
                onAdd={() => setModal(true)} />
              <Tabs active={cat} onPick={(c) => { setCat(c); setQuery(''); }} />
            </div>

            <div className="browse">
              {browsing && (
                <>
                  <div className="rise">
                    <CardRow title="Continue watching" items={continueList}
                      compMode={t.comprehension} openMenu={openMenu} setOpenMenu={setOpenMenu} />
                  </div>
                  <div className="rise-2">
                    <CardRow title="Most comprehensible" sub="— easiest for you right now"
                      items={compList} compMode={t.comprehension}
                      openMenu={openMenu} setOpenMenu={setOpenMenu} />
                  </div>
                </>
              )}

              <section className={'section ' + (browsing ? 'rise-3' : 'rise')}>
                <div className="section-head">
                  <h2>{gridHeading}<span className="sub">{gridSub}</span></h2>
                </div>
                {list.length === 0 ? (
                  <div className="empty-results">
                    <span className="er-ic"><Ic.search /></span>
                    <p className="er-t">No videos here yet</p>
                    <p className="er-s">
                      {mine ? "You haven't imported anything in this category. Paste a link to add one."
                        : "Try another category, or clear your search to see everything."}
                    </p>
                  </div>
                ) : (
                  <div className="grid">
                    {list.map((v) => (
                      <VideoCard key={v.id} v={v} compMode={t.comprehension}
                        openMenu={openMenu} setOpenMenu={setOpenMenu} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {modal && <AddModal onClose={() => setModal(false)} />}

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
        <TweakToggle label="Collapse sidebar" value={collapsed}
          onChange={(v) => { setCollapsed(v); setTweak('collapsed', v); }} />

        <TweakSection label="Library" />
        <TweakRadio label="Comprehension" value={t.comprehension}
          options={['ring', 'label']} onChange={(v) => setTweak('comprehension', v)} />
        <TweakToggle label="Show stats row" value={t.showStats}
          onChange={(v) => setTweak('showStats', v)} />

        <TweakSection label="Screen state" />
        <TweakRadio label="State" value={t.state}
          options={['default', 'first-run']} onChange={(v) => setTweak('state', v)} />
      </TweaksPanel>
    </div>
  );
}

/* ---------------- First run ---------------- */
function FirstRun({ onAdd }) {
  const [v, setV] = useState('');
  const go = () => { window.location.href = 'Import.html'; };
  return (
    <div className="firstrun">
      <div className="rise">
        <div className="fr-mark">淵</div>
        <h1>Welcome to Fuchine, Mai.</h1>
        <p className="fr-sub">
          Learn Japanese by watching what you love. Paste any YouTube video and we'll
          turn it into a study session — subtitles, a dictionary, and review built in.
        </p>
      </div>
      <div className="fr-paste rise-2">
        <div className="fr-field">
          <Ic.youtube className="yt" />
          <input value={v} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
            placeholder="Paste a YouTube link to study" />
        </div>
        <button className="btn-add" onClick={go}><Ic.plus /> Add video</button>
      </div>
      <div className="fr-hint rise-3">
        <Ic.spark /> Try a vlog, a news clip, or a cooking video — anything in Japanese works.
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
