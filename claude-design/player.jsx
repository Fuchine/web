/* Fuchine — Player (immersion): dictionary popup · AI explanation · sentence mining */
const { useState, useEffect, useRef, useLayoutEffect } = React;

const VIDEO = {
  title: '京都の朝、静かな散歩 — A quiet morning walk in Kyoto',
  channel: 'Kyoto Slow Living',
  cur: '5:24', total: '14:22', pct: 38,
};

/* focal line tokens (line 3) */
const FOCAL = [
  { t: '毎朝', key: 'maiasa' },
  { t: '川沿い', key: 'kawazoi' },
  { t: 'を', particle: true },
  { t: '歩いて', key: 'aruite' },
  { t: 'います', key: 'imasu' },
  { t: '。', punct: true },
];
const FOCAL_EN = 'Every morning, I walk along the river.';

/* dictionary entries */
const DICT = {
  maiasa:  { word: '毎朝', reading: 'まいあさ', pos: 'Noun · Adverb', freq: 4,
             defs: ['every morning'], lemma: null },
  kawazoi: { word: '川沿い', reading: 'かわぞい', pos: 'Noun', freq: 2,
             defs: ['along the river', 'riverside'], lemma: null },
  aruite:  { word: '歩いて', reading: 'あるいて', pos: 'Verb · te-form', freq: 5,
             defs: ['to walk', 'to go on foot'], lemma: { w: '歩く', r: 'あるく' } },
  imasu:   { word: 'います', reading: 'います', pos: 'Auxiliary verb', freq: 5,
             defs: ['to be; to exist (animate)', 'indicates a continuing action or state'], lemma: { w: 'いる', r: 'いる' } },
};
const FREQ_LABEL = ['', 'Rare', 'Uncommon', 'Common', 'Common', 'Very common'];

/* AI sentence explanation */
const EXPLAIN = {
  parts: [
    { ja: '毎朝', tag: 'time', label: 'every morning', note: 'Adverb of time — sets when the action happens.' },
    { ja: '川沿い', tag: 'noun', label: 'riverside', note: 'The place; literally “river-side”.' },
    { ja: 'を', tag: 'particle', accent: true, label: 'path marker', note: 'With a motion verb, を marks the route travelled — not a direct object.' },
    { ja: '歩いて います', tag: 'grammar', accent: true, label: '〜ている form', note: 'Te-form + いる expresses an ongoing or habitual action: “(I) walk / am walking”.' },
  ],
  note: 'Paired with 毎朝, 〜ています reads as a habit rather than a one-off — the natural way to say something you do regularly. And を after 川沿い is the giveaway: with 歩く it marks the path covered, so you walk along the river, not “walk the river” as an object.',
};

/* full transcript */
const LINES = [
  { time: '5:12', ja: 'おはようございます。', en: 'Good morning.' },
  { time: '5:16', ja: '今日は京都の鴨川に来ています。', en: "Today I'm here at the Kamo River in Kyoto." },
  { time: '5:24', ja: null, en: 'Every morning, I walk along the river.', current: true },
  { time: '5:31', ja: '空気がとても澄んでいて、気持ちがいいですね。', en: 'The air is so clear — it feels wonderful.' },
  { time: '5:38', ja: '少し寒いですが、散歩には最適です。', en: "It's a bit cold, but it's perfect for a walk." },
  { time: '5:45', ja: '向こうに見えるのは、有名なお寺です。', en: 'What you can see over there is a famous temple.' },
];

/* ---------------- Sidebar ---------------- */
function Sidebar() {
  const items = [
    { icon: Ic.home, label: 'Home' },
    { icon: Ic.library, label: 'Library', active: true },
    { icon: Ic.review, label: 'Review' },
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

/* ---------------- Dictionary popup ---------------- */
function DictPopup({ entry, pos, saved, onSave, onExplain, onClose }) {
  if (!pos) return null;
  return (
    <>
      <div className="scrim-soft" onClick={onClose} />
      <div className="dict-pop" style={{ left: pos.left, bottom: pos.bottom, width: pos.w }}
        onClick={(e) => e.stopPropagation()}>
        <div className="dict-arrow" style={{ left: pos.arrowLeft - 6 }} />

        <div className="dp-head">
          <div>
            <div className="dp-word">{entry.word}</div>
            <div className="dp-reading">{entry.reading}</div>
          </div>
        </div>

        <div className="dp-tags">
          <span className="dp-pos">{entry.pos}</span>
          <span className="dp-freq">
            <span className="dots">
              {[1,2,3,4,5].map((n) => <i key={n} className={n <= entry.freq ? 'on' : ''} />)}
            </span>
            <span className="flabel">{FREQ_LABEL[entry.freq]}</span>
          </span>
        </div>

        {entry.lemma && (
          <div className="dp-lemma">
            <span className="k">Dictionary form</span>
            <span className="v">{entry.lemma.w}<span className="r">{entry.lemma.r}</span></span>
          </div>
        )}

        <ol className="dp-defs">
          {entry.defs.map((d, i) => (
            <li key={i}><span className="n">{i + 1}</span><span>{d}</span></li>
          ))}
        </ol>

        <div className="dp-foot">
          <button className="dp-action primary" onClick={onExplain}><Ic.spark /> Explain</button>
          <button className={'dp-action save' + (saved ? ' saved' : '')} onClick={onSave}>
            {saved ? <Ic.bookmarkFill /> : <Ic.bookmark />} {saved ? 'Saved' : 'Save word'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------------- AI explanation (right rail tab) ---------------- */
const EX_TAG = {
  time: 'Time', noun: 'Noun', particle: 'Particle', grammar: 'Grammar',
};
function ExplainPanel() {
  return (
    <div className="explain">
      <div className="ex-scroll">
        <div className="ex-sentence">
          <div className="ex-ja jp">毎朝川沿いを<span className="ex-hl">歩いて</span>います。</div>
          <div className="ex-en">{FOCAL_EN}</div>
        </div>

        <div className="ex-meta">
          <Ic.spark /><span>Generated breakdown</span><span className="ex-dot" />Grammar
        </div>

        <ul className="ex-parts">
          {EXPLAIN.parts.map((p, i) => (
            <li key={i} className={'ex-part' + (p.accent ? ' accent' : '')}>
              <div className="ex-part-head">
                <span className="ex-tok jp">{p.ja}</span>
                <span className="ex-chip">{EX_TAG[p.tag]}</span>
                <span className="ex-gloss">{p.label}</span>
              </div>
              <p className="ex-note">{p.note}</p>
            </li>
          ))}
        </ul>

        <div className="ex-prose">
          <div className="ex-prose-label">In plain terms</div>
          <p>{EXPLAIN.note}</p>
        </div>
      </div>

      <div className="ex-foot">
        <button className="ex-fbtn"><Ic.refresh /> Regenerate</button>
        <button className="ex-fbtn primary"><Ic.bookmark /> Save note</button>
      </div>
    </div>
  );
}

/* ---------------- Mined sentence confirmation ---------------- */
function MinedCard({ onUndo, onClose }) {
  return (
    <div className="mined-wrap">
      <div className="mined" onClick={(e) => e.stopPropagation()}>
        <div className="mined-top">
          <span className="mined-check"><Ic.check /></span>
          <div className="mined-titles">
            <div className="mined-title">Mined to Review</div>
            <div className="mined-sub">1 new card · due now</div>
          </div>
          <button className="mined-x" onClick={onClose} title="Dismiss"><Ic.close /></button>
        </div>

        <div className="mined-card">
          <span className="mined-card-tag">Front</span>
          <div className="mined-cloze jp">毎朝川沿いを<span className="cloze">［ ＿＿ ］</span>います。</div>
          <div className="mined-card-en">Every morning, I walk along the river.</div>
          <div className="mined-card-foot">
            <span className="mined-target jp">歩いて<span className="r">あるいて</span></span>
            <span className="mined-from"><Ic.youtube /> Kyoto Slow Living · 5:24</span>
          </div>
        </div>

        <div className="mined-actions">
          <button className="mined-btn" onClick={onUndo}>Undo</button>
          <button className="mined-btn primary">View deck <Ic.arrow /></button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "panel": "transcript",
  "overlay": "word",
  "sidebar": "collapsed",
  "word": "aruite"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [pos, setPos] = useState(null);

  const stageRef = useRef(null);
  const tokenRefs = useRef({});

  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);

  const expanded = t.sidebar === 'expanded';
  const showRail = t.panel !== 'hidden';
  const wordOpen = t.overlay === 'word';
  const mined = t.overlay === 'mined';
  const active = t.word;

  // anchor the popup under the active token
  useLayoutEffect(() => {
    if (!wordOpen || !active) { setPos(null); return; }
    const compute = () => {
      const stage = stageRef.current;
      const tok = tokenRefs.current[active];
      if (!stage || !tok) return;
      const s = stage.getBoundingClientRect();
      const r = tok.getBoundingClientRect();
      const popW = 324, pad = 18, gap = 12;
      const center = r.left - s.left + r.width / 2;
      let left = center - popW / 2;
      left = Math.max(pad, Math.min(left, s.width - popW - pad));
      setPos({ left, bottom: s.height - (r.top - s.top) + gap, arrowLeft: center - left, w: popW });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [wordOpen, active, expanded, showRail, t.panel]);

  const clickWord = (key) => { setTweak({ word: key, overlay: 'word' }); setSaved(false); };
  const closePopup = () => setTweak('overlay', 'none');
  const explain = () => setTweak({ overlay: 'none', panel: 'explain' });
  const mine = () => setTweak('overlay', 'mined');

  const entry = DICT[active];

  return (
    <div className={'app' + (expanded ? ' expanded' : '') + (showRail ? '' : ' notranscript')}>
      <Sidebar />

      <div className="player-main">
        {/* top bar */}
        <div className="p-top">
          <button className="p-back" title="Back to library"
            onClick={() => { window.location.href = 'Dashboard.html'; }}><Ic.chevron /></button>
          <div className="p-titles">
            <div className="p-title jp">{VIDEO.title}</div>
            <div className="p-chan">{VIDEO.channel}</div>
          </div>
          <div className="p-actions">
            <button className="p-iconbtn" title="Subtitle settings"><Ic.caption /></button>
            <button className="p-iconbtn on" title="Saved words"><Ic.bookmark /></button>
            <button className="p-iconbtn"
              onClick={() => setTweak('sidebar', expanded ? 'collapsed' : 'expanded')}
              title="More"><Ic.settings /></button>
          </div>
        </div>

        <div className="p-body">
          {/* stage */}
          <div className="stage" ref={stageRef}>
            <div className="video rise">
              <div className="scene">
                <div className="sun" />
                <div className="horizon" />
                <div className="water" />
              </div>
              <span className="vtime">{VIDEO.cur} · live</span>
            </div>

            {/* focal dual subtitle */}
            <div className="subs">
              <div className="subs-ja">
                {FOCAL.map((tok, i) => {
                  if (tok.particle) return <span key={i} className="tok particle">{tok.t}</span>;
                  if (tok.punct) return <span key={i} className="tok punct">{tok.t}</span>;
                  return (
                    <span key={i}
                      ref={(el) => { tokenRefs.current[tok.key] = el; }}
                      className={'tok' + (wordOpen && active === tok.key ? ' active' : '')}
                      onClick={() => clickWord(tok.key)}>
                      {tok.t}
                    </span>
                  );
                })}
              </div>
              <div className="subs-en">{FOCAL_EN}</div>

              {/* sentence-level actions — entry points for Explain & Mine */}
              <div className="sent-actions">
                <button className={'sent-btn' + (t.panel === 'explain' ? ' on' : '')} onClick={explain}>
                  <Ic.spark /> Explain
                </button>
                <button className={'sent-btn' + (mined ? ' on' : '')} onClick={mine}>
                  <Ic.plus /> Mine sentence
                </button>
              </div>
            </div>

            {/* controls */}
            <div className="controls">
              <div className="c-cluster">
                <button className="c-btn" title="Back 5s"><Ic.rewind /></button>
                <button className="c-btn c-play" title="Pause"><Ic.pause /></button>
                <button className="c-btn" title="Forward 5s"><Ic.forward /></button>
              </div>
              <span className="c-time"><b>{VIDEO.cur}</b> / {VIDEO.total}</span>
              <div className="scrub">
                <div className="fill" style={{ width: VIDEO.pct + '%' }} />
                <div className="knob" style={{ left: VIDEO.pct + '%' }} />
              </div>
              <div className="c-cluster">
                <button className="c-btn on" title="Loop line"><Ic.loop /></button>
                <button className="c-btn on" title="Captions"><Ic.caption /></button>
                <button className="c-speed" title="Playback speed">1.0×</button>
                <button className="c-btn" title="Volume"><Ic.volume /></button>
                <button className="c-btn" title="Fullscreen"><Ic.fullscreen /></button>
              </div>
            </div>

            {/* anchored dictionary popup */}
            {wordOpen && entry && (
              <DictPopup entry={entry} pos={pos} saved={saved}
                onSave={() => setSaved((v) => !v)} onExplain={explain} onClose={closePopup} />
            )}

            {/* mined confirmation */}
            {mined && (
              <>
                <div className="scrim-soft" onClick={() => setTweak('overlay', 'none')} />
                <MinedCard onUndo={() => setTweak('overlay', 'none')} onClose={() => setTweak('overlay', 'none')} />
              </>
            )}
          </div>

          {/* right rail — Transcript / Explain */}
          {showRail && (
            <aside className="rail">
              <div className="rail-tabs">
                <button className={'rail-tab' + (t.panel === 'transcript' ? ' on' : '')}
                  onClick={() => setTweak('panel', 'transcript')}>
                  <Ic.list /> Transcript
                </button>
                <button className={'rail-tab' + (t.panel === 'explain' ? ' on' : '')}
                  onClick={() => setTweak('panel', 'explain')}>
                  <Ic.spark /> Explain
                </button>
              </div>

              {t.panel === 'transcript' ? (
                <>
                  <div className="tr-sub">
                    <div className="tr-tools">
                      <button className="tr-tool on" title="Show furigana"><Ic.text /></button>
                      <button className="tr-tool" title="Search transcript"><Ic.search /></button>
                    </div>
                  </div>
                  <div className="tr-list">
                    {LINES.map((ln, i) => (
                      <div key={i} className={'tr-line' + (ln.current ? ' current' : '')}>
                        <span className="tr-time">{ln.time}</span>
                        <div>
                          <div className="tr-ja jp">
                            {ln.current ? (<>毎朝川沿いを<span className="htok">歩いて</span>います。</>) : ln.ja}
                          </div>
                          <div className="tr-en">{ln.en}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <ExplainPanel />
              )}
            </aside>
          )}
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Player state" />
        <TweakRadio label="Stage overlay" value={t.overlay}
          options={['none', 'word', 'mined']} onChange={(v) => setTweak('overlay', v)} />
        <TweakRadio label="Right panel" value={t.panel}
          options={['transcript', 'explain', 'hidden']} onChange={(v) => setTweak('panel', v)} />
        <TweakSelect label="Clicked word" value={active}
          options={['maiasa', 'kawazoi', 'aruite', 'imasu']}
          onChange={(v) => { setSaved(false); setTweak({ word: v, overlay: 'word' }); }} />

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
