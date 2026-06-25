/* Fuchine — Vocabulary collection (gamified, restrained)
   Tabs Vocabulary / Grammar · coverage analysis · status-coloured cards
   with per-skill mastery (Reading / Listening / Speaking / Recall).
   Clicking a card opens an entry detail slide-over. */
const { useState, useEffect, useMemo } = React;

const FREQ_LABEL = ['', 'Rare', 'Uncommon', 'Common', 'Common', 'Very common'];

/* the four practice modalities the app tracks, used as per-word mastery */
const SKILLS = [
  { k: 'read',   label: 'Reading',   icon: Ic.dict },
  { k: 'listen', label: 'Listening', icon: Ic.volume },
  { k: 'speak',  label: 'Speaking',  icon: Ic.phrases },
  { k: 'recall', label: 'Recall',    icon: Ic.review },
];

/* status meta — reuses the app's established status palette */
const STATUS = {
  known:    { label: 'Known' },
  learning: { label: 'Learning' },
  new:      { label: 'New' },
};

/* mastery: [read, listen, speak, recall], each 0–3 (0 empty · 1–2 partial · 3 full) */
const WORDS = [
  { id: 'no',      w: 'の',     r: 'no',      pos: 'Particle', def: 'possessive / linking particle', status: 'known', freq: 5, jlpt: 'N5', m: [3,3,3,3] },
  { id: 'ni',      w: 'に',     r: 'ni',      pos: 'Particle', def: 'to; at; in (location / time)',   status: 'known', freq: 5, jlpt: 'N5', m: [3,3,3,2] },
  { id: 'wa',      w: 'は',     r: 'wa',      pos: 'Particle', def: 'topic marker',                   status: 'known', freq: 5, jlpt: 'N5', m: [3,3,2,3] },
  { id: 'ga',      w: 'が',     r: 'ga',      pos: 'Particle', def: 'subject marker; but',            status: 'known', freq: 5, jlpt: 'N5', m: [3,3,3,2] },
  { id: 'o',       w: 'を',     r: 'o',       pos: 'Particle', def: 'object / path marker',           status: 'known', freq: 5, jlpt: 'N5', m: [3,2,2,3] },
  { id: 'de',      w: 'で',     r: 'de',      pos: 'Particle', def: 'by; with; at',                   status: 'known', freq: 5, jlpt: 'N5', m: [3,3,2,2] },
  { id: 'desu',    w: 'です',   r: 'desu',    pos: 'Copula',   def: 'to be (polite)',                 status: 'known', freq: 5, jlpt: 'N5', m: [3,3,3,3] },
  { id: 'ne',      w: 'ね',     r: 'ne',      pos: 'Particle', def: 'right? (seeking agreement)',     status: 'known', freq: 4, jlpt: 'N5', m: [3,3,3,2] },
  { id: 'to',      w: 'と',     r: 'to',      pos: 'Particle', def: 'and; with; quotation',           status: 'known', freq: 5, jlpt: 'N5', m: [3,2,2,3] },
  { id: 'da',      w: 'だ',     r: 'da',      pos: 'Copula',   def: 'to be (plain)',                  status: 'known', freq: 5, jlpt: 'N5', m: [3,3,2,3] },
  { id: 'asa',     w: '朝',     r: 'asa',     pos: 'Noun',     def: 'morning',                        status: 'known', freq: 4, jlpt: 'N5', m: [3,2,2,3] },
  { id: 'otera',   w: 'お寺',   r: 'otera',   pos: 'Noun',     def: 'temple',                         status: 'known', freq: 3, jlpt: 'N4', m: [3,2,1,3] },
  { id: 'tenki',   w: '天気',   r: 'tenki',   pos: 'Noun',     def: 'weather',                        status: 'known', freq: 4, jlpt: 'N5', m: [3,3,2,2] },

  { id: 'mo',      w: 'も',     r: 'mo',      pos: 'Particle', def: 'also; too',                      status: 'learning', freq: 5, jlpt: 'N5', m: [2,2,1,2] },
  { id: 'kara',    w: 'から',   r: 'kara',    pos: 'Particle', def: 'from; because',                  status: 'learning', freq: 4, jlpt: 'N5', m: [2,1,1,2] },
  { id: 'aruku',   w: '歩く',   r: 'aruku',   pos: 'Verb',     def: 'to walk; to go on foot',         status: 'learning', freq: 5, jlpt: 'N5', m: [2,2,1,1] },
  { id: 'kawazoi', w: '川沿い', r: 'kawazoi', pos: 'Noun',     def: 'riverside; along the river',     status: 'learning', freq: 2, jlpt: 'N3', m: [2,1,0,1] },
  { id: 'saiteki', w: '最適',   r: 'saiteki', pos: 'Na-adj',   def: 'optimal; ideal',                 status: 'learning', freq: 3, jlpt: 'N2', m: [1,1,0,2] },
  { id: 'noru',    w: '乗る',   r: 'noru',    pos: 'Verb',     def: 'to ride; to board',              status: 'learning', freq: 4, jlpt: 'N5', m: [2,1,1,1] },
  { id: 'shizuka', w: '静か',   r: 'shizuka', pos: 'Na-adj',   def: 'quiet; calm',                    status: 'learning', freq: 3, jlpt: 'N5', m: [1,2,1,1] },
  { id: 'kuuki',   w: '空気',   r: 'kuuki',   pos: 'Noun',     def: 'air; atmosphere',                status: 'learning', freq: 3, jlpt: 'N4', m: [1,1,0,1] },

  { id: 'na',      w: 'な',     r: 'na',      pos: 'Particle', def: 'na-adjective marker',            status: 'new', freq: 4, jlpt: 'N5', m: [0,0,0,0] },
  { id: 'koto',    w: '事',     r: 'koto',    pos: 'Noun',     def: 'thing; matter (abstract)',       status: 'new', freq: 4, jlpt: 'N4', m: [0,0,0,0] },
  { id: 'sanpo',   w: '散歩',   r: 'sanpo',   pos: 'Noun',     def: 'a walk; a stroll',               status: 'new', freq: 4, jlpt: 'N4', m: [1,0,0,0] },
  { id: 'sumu',    w: '澄む',   r: 'sumu',    pos: 'Verb',     def: 'to become clear (water / air)',  status: 'new', freq: 2, jlpt: 'N1', m: [0,0,0,0] },
  { id: 'kakunin', w: '確認',   r: 'kakunin', pos: 'Noun',     def: 'confirmation; checking',         status: 'new', freq: 3, jlpt: 'N3', m: [0,1,0,0] },
  { id: 'tokasu',  w: '溶かす', r: 'tokasu',  pos: 'Verb',     def: 'to dissolve; to melt',           status: 'new', freq: 2, jlpt: 'N2', m: [0,0,0,0] },
  { id: 'nai',     w: '無い',   r: 'nai',     pos: 'Adj',      def: 'nonexistent; not having',        status: 'new', freq: 4, jlpt: 'N4', m: [1,0,0,0] },
];

/* grammar points (second tab) */
const GRAMMAR = [
  { id: 'teiru',  pat: '〜ている',  r: 'te-iru',  def: 'ongoing or habitual action',          status: 'learning', freq: 5, jlpt: 'N5', m: [2,1,1,2] },
  { id: 'wo-path',pat: 'を + 移動',  r: 'o + motion', def: 'を marks the path travelled',       status: 'learning', freq: 4, jlpt: 'N4', m: [2,1,0,1] },
  { id: 'kara-r', pat: '〜から',     r: 'kara',    def: 'because; gives a reason',             status: 'known', freq: 5, jlpt: 'N5', m: [3,2,2,3] },
  { id: 'node',   pat: '〜ので',     r: 'node',    def: 'because (softer, polite)',            status: 'new', freq: 4, jlpt: 'N4', m: [0,0,0,0] },
  { id: 'nakereba',w:'', pat: '〜なければ', r: 'nakereba', def: 'if not …; must',             status: 'new', freq: 3, jlpt: 'N4', m: [0,0,0,0] },
  { id: 'tara',   pat: '〜たら',     r: 'tara',    def: 'when / if (conditional)',             status: 'learning', freq: 4, jlpt: 'N4', m: [1,1,0,1] },
];

/* shared "appears in your videos" sources for the detail panel */
const SOURCES = [
  { src: 'Kyoto Slow Living', jp: '京都の朝、静かな散歩', time: '5:24' },
  { src: 'NHK やさしい日本語', jp: 'ニュースで学ぶ日本語', time: '1:02' },
  { src: 'Tokyo Days', jp: '東京の電車に乗ってみた', time: '0:38' },
];

const TYPES = [
  { v: 'all', l: 'All items' },
  { v: 'new', l: 'New' },
  { v: 'learning', l: 'Learning' },
  { v: 'known', l: 'Known' },
];

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'dict', icon: Ic.dict, label: 'Dictionary', active: true },
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

/* per-card mastery pips — one per modality, filled by level */
function MasteryPips({ m, showSkills }) {
  if (!showSkills) return null;
  return (
    <div className="vc-skills" aria-hidden="true">
      {SKILLS.map((s, i) => {
        const lv = m[i];
        const cls = lv >= 3 ? 'full' : lv >= 1 ? 'part' : 'empty';
        const I = s.icon;
        return (
          <span key={s.k} className={'vc-pip ' + cls} title={s.label}><I /></span>
        );
      })}
    </div>
  );
}

function FreqDots({ n }) {
  return (
    <span className="freq">
      <span className="dots">{[1,2,3,4,5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
      <span className="flabel">{FREQ_LABEL[n]}</span>
    </span>
  );
}

/* ---------------- Detail slide-over ---------------- */
function Detail({ item, kind, idx, saved, onSave, onToast, onClose }) {
  if (!item) return null;
  const total = item.m.reduce((a, b) => a + b, 0);
  const pct = Math.round((total / (item.m.length * 3)) * 100);
  return (
    <>
      <div className="voc-scrim" onClick={onClose} />
      <aside className="voc-detail" onClick={(e) => e.stopPropagation()}>
        <div className="vd-bar">
          <span className={'vd-status s-' + item.status}>{STATUS[item.status].label}</span>
          <span className="vd-spacer" />
          <button className="vd-x" onClick={onClose} title="Close"><Ic.close /></button>
        </div>
        <div className="vd-scroll">
          <div className="vd-head">
            <div>
              <div className="vd-word jp">{kind === 'grammar' ? item.pat : item.w}</div>
              <div className="vd-reading">{item.r}</div>
            </div>
            <span className="vd-num">#{idx}</span>
          </div>

          <div className="vd-tags">
            <span className="vd-pos">{item.pos || 'Grammar'}</span>
            <span className="vd-jlpt">{item.jlpt}</span>
            <FreqDots n={item.freq} />
          </div>

          <p className="vd-def">{item.def}</p>

          <div className="vd-actions">
            <button className={'vd-save' + (saved ? ' saved' : '')} onClick={onSave}>
              {saved ? <Ic.bookmarkFill /> : <Ic.bookmark />} {saved ? 'Saved' : 'Save word'}
            </button>
            <button className="vd-ghost" onClick={() => onToast('♪ Playing pronunciation')}><Ic.volume /></button>
          </div>

          <div className="vd-section">
            <div className="vd-sh">Mastery <span className="vd-pct">{pct}%</span></div>
            <div className="vd-mastery">
              {SKILLS.map((s, i) => {
                const I = s.icon;
                return (
                  <div key={s.k} className="vd-skill">
                    <span className="vd-skill-ic"><I /></span>
                    <span className="vd-skill-name">{s.label}</span>
                    <span className="vd-meter">
                      {[1,2,3].map((n) => <i key={n} className={n <= item.m[i] ? 'on' : ''} />)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="vd-section">
            <div className="vd-sh">Appears in your videos <span className="vd-count">{SOURCES.length}</span></div>
            <div className="vd-sources">
              {SOURCES.map((sc, i) => (
                <a key={i} className="vd-source" href="Player.html">
                  <span className="vd-src-ic"><Ic.youtube /></span>
                  <span className="vd-src-meta">
                    <span className="vd-src-title jp">{sc.jp}</span>
                    <span className="vd-src-sub">{sc.src} · {sc.time}</span>
                  </span>
                  <span className="vd-src-play"><Ic.play /></span>
                </a>
              ))}
            </div>
          </div>

          <div className="vd-practice">
            <button className="vd-practice-btn" onClick={() => { window.location.href = 'Review.html'; }}>
              <Ic.review /> Practice now
            </button>
            <button className="vd-practice-btn ghost" onClick={() => { window.location.href = 'Player.html'; }}>
              <Ic.play /> See in context
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "tab": "vocabulary",
  "type": "all",
  "romaji": "on",
  "skills": "on",
  "collapsed": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [saved, setSaved] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const kind = t.tab === 'grammar' ? 'grammar' : 'vocabulary';
  const source = kind === 'grammar' ? GRAMMAR : WORDS;

  const counts = useMemo(() => {
    const c = { new: 0, learning: 0, known: 0 };
    source.forEach((x) => { c[x.status] += 1; });
    return c;
  }, [source]);
  const totalN = source.length;

  const list = useMemo(() => {
    return source.filter((x) => {
      if (t.type !== 'all' && x.status !== t.type) return false;
      if (q) {
        const hay = ((x.w || x.pat || '') + x.r + x.def + x.pos).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [source, t.type, q]);

  const selItem = sel ? source.find((x) => x.id === sel) : null;
  const selIdx = selItem ? source.indexOf(selItem) + 1 : 0;

  const TABS = [{ v: 'vocabulary', l: 'Vocabulary' }, { v: 'grammar', l: 'Grammar' }];

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main vocab-main">
        {/* header — tabs + secondary search + type filter */}
        <div className="voc-top">
          <div className="voc-tabs">
            {TABS.map((tb) => (
              <button key={tb.v} className={'voc-tab' + (t.tab === tb.v ? ' on' : '')}
                onClick={() => { setTweak('tab', tb.v); setSel(null); }}>{tb.l}</button>
            ))}
          </div>
          <div className="voc-top-right">
            <div className={'voc-search' + (searchOpen || q ? ' open' : '')}>
              <button className="voc-search-ic" onClick={() => setSearchOpen((o) => !o)} title="Search">
                <Ic.search />
              </button>
              <input className="voc-search-in" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search…" onBlur={() => { if (!q) setSearchOpen(false); }} />
              {q && <button className="voc-search-x" onClick={() => setQ('')} title="Clear"><Ic.close /></button>}
            </div>
            <div className="seg voc-typefilter">
              {TYPES.map((o) => (
                <button key={o.v} className={'seg-b' + (t.type === o.v ? ' on' : '')}
                  onClick={() => setTweak('type', o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* coverage analysis */}
        <div className="voc-coverage">
          <div className="cov-left">
            <span className="cov-title">Coverage analysis</span>
            <span className="cov-sub">{kind === 'grammar' ? 'Grammar points' : 'Words'} you've met across your videos</span>
          </div>
          <div className="cov-mid">
            <div className="cov-bar">
              {['known','learning','new'].map((s) => counts[s] > 0 && (
                <div key={s} className={'cov-seg s-' + s} style={{ flexGrow: counts[s] }}
                  title={STATUS[s].label + ' · ' + counts[s]}>
                  <span className="cov-seg-lab">{STATUS[s].label} · {counts[s]}</span>
                </div>
              ))}
            </div>
            <div className="cov-legend">
              {['known','learning','new'].map((s) => (
                <span key={s} className="cov-leg"><i className={'s-' + s} />{STATUS[s].label}<b>{counts[s]}</b></span>
              ))}
            </div>
          </div>
          <div className="cov-right">
            <div className="cov-total"><b>{totalN}</b> <span>/ 206,538</span></div>
            <div className="cov-total-lab">Total coverage · 0.0%</div>
          </div>
        </div>

        {/* grid */}
        <div className="voc-scroll">
          {list.length === 0 ? (
            <div className="voc-none">No {kind === 'grammar' ? 'grammar points' : 'words'} match this filter.</div>
          ) : (
            <div className="voc-grid">
              {list.map((x) => {
                const i = source.indexOf(x) + 1;
                return (
                  <button key={x.id} className={'voc-card s-' + x.status + (sel === x.id ? ' on' : '')}
                    onClick={() => setSel(x.id)}>
                    <div className="vc-top">
                      <span className="vc-badge">{STATUS[x.status].label}</span>
                      <span className="vc-num">#{i}</span>
                    </div>
                    <div className="vc-word jp">{kind === 'grammar' ? x.pat : x.w}</div>
                    {t.romaji === 'on' && <div className="vc-romaji">{x.r}</div>}
                    <MasteryPips m={x.m} showSkills={t.skills === 'on'} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {selItem && (
        <Detail item={selItem} kind={kind} idx={selIdx}
          saved={!!saved[selItem.id]}
          onSave={() => {
            setSaved((s) => ({ ...s, [selItem.id]: !s[selItem.id] }));
            setToast(saved[selItem.id] ? 'Removed from saved' : 'Saved to your words');
          }}
          onToast={setToast}
          onClose={() => setSel(null)} />
      )}

      {toast && (
        <div className="dict-toast"><Ic.check /> {toast}</div>
      )}

      <TweaksPanel>
        <TweakSection label="Collection" />
        <TweakRadio label="Tab" value={t.tab}
          options={['vocabulary', 'grammar']} onChange={(v) => { setTweak('tab', v); setSel(null); }} />
        <TweakSelect label="Type filter" value={t.type}
          options={['all', 'new', 'learning', 'known']} onChange={(v) => setTweak('type', v)} />

        <TweakSection label="Card" />
        <TweakRadio label="Romaji" value={t.romaji}
          options={['on', 'off']} onChange={(v) => setTweak('romaji', v)} />
        <TweakRadio label="Mastery pips" value={t.skills}
          options={['on', 'off']} onChange={(v) => setTweak('skills', v)} />

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
