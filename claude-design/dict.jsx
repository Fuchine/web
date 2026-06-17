/* Fuchine — Dictionary search */
const { useState, useEffect } = React;

const FREQ_LABEL = ['', 'Rare', 'Uncommon', 'Common', 'Common', 'Very common'];

/* search results for query "歩 · walk" */
const RESULTS = [
  { id: 'aruku', word: '歩く', reading: 'あるく', pos: 'Verb', gloss: 'to walk; to go on foot', freq: 5, saved: true },
  { id: 'sanpo', word: '散歩', reading: 'さんぽ', pos: 'Noun · する-verb', gloss: 'a walk; a stroll', freq: 4, saved: false },
  { id: 'aruite', word: '歩いて', reading: 'あるいて', pos: 'Verb · te-form', gloss: 'walking (continuative of 歩く)', freq: 5, saved: true },
  { id: 'hodou', word: '歩道', reading: 'ほどう', pos: 'Noun', gloss: 'footpath; sidewalk', freq: 3, saved: false },
  { id: 'ippo', word: '一歩', reading: 'いっぽ', pos: 'Noun', gloss: 'one step', freq: 3, saved: false },
  { id: 'aruki', word: '歩き', reading: 'あるき', pos: 'Noun', gloss: 'walking; a walk', freq: 3, saved: false },
];

const ENTRY = {
  word: '歩く', reading: 'あるく', pos: 'Godan verb · intransitive', freq: 5,
  senses: [
    { defs: ['to walk', 'to go on foot'], tags: ['common'] },
    { defs: ['to go (somewhere) step by step', 'to make one\'s way'], tags: ['figurative'] },
  ],
  conj: [
    { k: 'Dictionary', v: '歩く', r: 'あるく' },
    { k: 'Te-form', v: '歩いて', r: 'あるいて' },
    { k: 'Past', v: '歩いた', r: 'あるいた' },
    { k: 'Negative', v: '歩かない', r: 'あるかない' },
    { k: 'Polite', v: '歩きます', r: 'あるきます' },
    { k: 'Potential', v: '歩ける', r: 'あるける' },
  ],
  examples: [
    { ja: ['毎朝川沿いを', '歩いて', 'います。'], en: 'Every morning, I walk along the river.', src: 'Kyoto Slow Living', time: '5:24' },
    { ja: ['駅まで', '歩く', 'のが好きです。'], en: 'I like walking to the station.', src: '東京の電車に乗ってみた', time: '2:11' },
    { ja: ['もう少し', '歩き', 'ましょう。'], en: "Let's walk a little more.", src: '京都の朝、静かな散歩', time: '8:47' },
  ],
};

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

function FreqDots({ n }) {
  return (
    <span className="freq">
      <span className="dots">{[1,2,3,4,5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
      <span className="flabel">{FREQ_LABEL[n]}</span>
    </span>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "results",
  "collapsed": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  const [sel, setSel] = useState('aruku');
  const [lang, setLang] = useState('auto');
  const [q, setQ] = useState('歩く');

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const empty = t.state === 'empty';

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main dict-main">
        {/* search header */}
        <div className="dict-top">
          <div className="dict-search">
            <Ic.search className="ds-ic" />
            <input className="ds-input" value={empty ? '' : q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search a word, reading, or meaning…" />
            {!empty && <button className="ds-clear" onClick={() => setTweak('state', 'empty')} title="Clear"><Ic.close /></button>}
          </div>
          <div className="dict-lang seg">
            {[{v:'auto',l:'Auto'},{v:'ja',l:'日本語'},{v:'en',l:'English'}].map((o) => (
              <button key={o.v} className={'seg-b' + (lang === o.v ? ' on' : '')} onClick={() => setLang(o.v)}>{o.l}</button>
            ))}
          </div>
        </div>

        {empty ? (
          <div className="dict-empty">
            <span className="de-mark"><Ic.dict /></span>
            <h2>Look up any Japanese word</h2>
            <p>Search by kanji, kana, romaji, or English meaning. Every entry links back to the moments it appears in your videos.</p>
            <div className="de-recent">
              <span className="de-rl">Recent</span>
              <div className="de-chips">
                {['川沿い', '澄む', '最適', 'おはよう', '散歩'].map((w) => (
                  <button key={w} className="de-chip jp" onClick={() => setTweak('state', 'results')}>{w}</button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="dict-body">
            {/* results list */}
            <div className="dict-results">
              <div className="dr-head"><span><b>{RESULTS.length}</b> results for “<span className="jp">歩</span>”</span></div>
              <div className="dr-list">
                {RESULTS.map((r) => (
                  <button key={r.id} className={'dr-item' + (sel === r.id ? ' on' : '')} onClick={() => setSel(r.id)}>
                    <div className="dr-main">
                      <span className="dr-word jp">{r.word}</span>
                      <span className="dr-reading jp">{r.reading}</span>
                      {r.saved && <span className="dr-saved"><Ic.bookmarkFill /></span>}
                    </div>
                    <div className="dr-gloss">{r.gloss}</div>
                    <div className="dr-meta"><span className="dr-pos">{r.pos}</span><FreqDots n={r.freq} /></div>
                  </button>
                ))}
              </div>
            </div>

            {/* entry detail */}
            <div className="dict-detail">
              <div className="dd-scroll">
                <div className="dd-head">
                  <div>
                    <div className="dd-word jp">{ENTRY.word}</div>
                    <div className="dd-reading jp">{ENTRY.reading}</div>
                  </div>
                  <div className="dd-actions">
                    <button className="dd-save saved" title="Saved"><Ic.bookmarkFill /> Saved</button>
                    <button className="dd-icon" title="Hear pronunciation"><Ic.volume /></button>
                  </div>
                </div>
                <div className="dd-tags">
                  <span className="dd-pos">{ENTRY.pos}</span>
                  <FreqDots n={ENTRY.freq} />
                </div>

                <ol className="dd-senses">
                  {ENTRY.senses.map((s, i) => (
                    <li key={i}>
                      <span className="dd-n">{i + 1}</span>
                      <div>
                        <div className="dd-def">{s.defs.join('; ')}</div>
                        <div className="dd-stags">{s.tags.map((tg) => <span key={tg} className="dd-stag">{tg}</span>)}</div>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="dd-section">
                  <div className="dd-sh">Conjugations</div>
                  <div className="dd-conj">
                    {ENTRY.conj.map((c) => (
                      <div key={c.k} className="dd-cj">
                        <span className="cj-k">{c.k}</span>
                        <span className="cj-v jp">{c.v}<span className="cj-r">{c.r}</span></span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="dd-section">
                  <div className="dd-sh">From your videos <span className="dd-count">{ENTRY.examples.length}</span></div>
                  <div className="dd-examples">
                    {ENTRY.examples.map((ex, i) => (
                      <a key={i} className="dd-ex" href="Player.html">
                        <div className="dd-ex-ja jp">
                          {ex.ja.map((part, j) => j === 1
                            ? <span key={j} className="hl">{part}</span>
                            : <span key={j}>{part}</span>)}
                        </div>
                        <div className="dd-ex-en">{ex.en}</div>
                        <div className="dd-ex-src"><Ic.youtube /> <span className="jp">{ex.src}</span> · {ex.time} <span className="dd-ex-play"><Ic.play /> Play</span></div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <TweaksPanel>
        <TweakSection label="Screen state" />
        <TweakRadio label="State" value={t.state}
          options={['results', 'empty']} onChange={(v) => setTweak('state', v)} />

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
