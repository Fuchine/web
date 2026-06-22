/* Fuchine — Shadowing (pronunciation practice)
   Repeat the line aloud; get an encouraging, segment-level score.
   States: prompt · recording · processing · result. */
const { useState, useEffect, useRef } = React;

/* extra glyphs not in the shared set */
Ic.mic = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </svg>
);

const CLIP = { channel: 'Kyoto Slow Living', time: '5:24' };
const SESSION = { idx: 3, total: 8 };

/* the line, tokenised. status only matters in RESULT. */
const SENTENCE = [
  { ja: '毎朝',   rt: 'まいあさ', status: 'good' },
  { ja: '川沿い', rt: 'かわぞい', status: 'work' },
  { ja: 'を',     rt: null,       status: 'good' },
  { ja: '歩いて', rt: 'あるいて', status: 'close' },
  { ja: 'います', rt: null,       status: 'good' },
  { ja: '。',     rt: null,       punct: true },
];
const EN = 'Every morning, I walk along the river.';

const SCORE = 84;

const FLAGS = [
  { kind: 'work', body: <>On <b className="jp">川沿い（かわぞい）</b>, the pitch rises a beat early — keep <b className="jp">か</b> low, then lift into <b className="jp">わ</b>.</> },
  { kind: 'close', body: <>The <b className="jp">歩いて</b> vowels were a touch clipped. Let the <b>い</b> ring a little longer.</> },
  { kind: 'ok', body: <>Lovely rhythm overall — your pacing matched the speaker closely.</> },
];

const PROSODY = [
  { name: 'Pitch accent', val: 76, warn: true },
  { name: 'Rhythm & timing', val: 89 },
  { name: 'Fluency', val: 82 },
];

/* deterministic little waveforms for the A/B compare */
const refWave  = [3,5,7,6,8,5,4,6,9,7,5,4,3,5,7,8,6,4,5,7,6,4,3,5,6,4,3,4,6,5,3,2];
const youWave  = [3,5,6,6,9,9,8,5,4,5,8,7,4,3,5,7,7,5,4,6,6,4,3,4,7,8,5,3,4,5,4,2];
/* indices that land on the flagged syllable — tinted in "you" */
const youHot = new Set([4,5,6,24,25]);

/* ---------------- Sidebar (minimal rail) ---------------- */
function Rail() {
  const items = [
    { icon: Ic.home, label: 'Home', href: 'Home.html' },
    { icon: Ic.library, label: 'Library', href: 'Albums.html', active: true },
    { icon: Ic.review, label: 'Review', href: 'Review.html' },
    { icon: Ic.settings, label: 'Settings', href: 'Settings.html' },
  ];
  return (
    <aside className="side">
      <div className="side-head"><span className="brand-mark">淵</span></div>
      <nav className="nav">
        {items.map((it) => {
          const I = it.icon;
          return (
            <button key={it.label} className={'nav-item' + (it.active ? ' active' : '')}
              title={it.label} onClick={() => { window.location.href = it.href; }}>
              <I />
            </button>
          );
        })}
      </nav>
      <div className="side-spacer" />
      <div className="side-foot"><span className="avatar">M</span></div>
    </aside>
  );
}

/* ---------------- Sentence renderer ---------------- */
function Sentence({ scored }) {
  return (
    <div className="sh-sentence jp">
      {SENTENCE.map((tk, i) => {
        const cls = 'tok' + (scored && !tk.punct ? ' ' + tk.status : '');
        if (tk.rt) {
          return <ruby key={i} className={cls}>{tk.ja}<rt>{tk.rt}</rt></ruby>;
        }
        return <span key={i} className={cls}>{tk.ja}</span>;
      })}
    </div>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "result",
  "furigana": "on"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);

  const state = t.state;
  const scored = state === 'result';

  /* recording timer */
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (state !== 'recording') { setSecs(0); return; }
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);
  const mmss = `0:${String(secs).padStart(2, '0')}`;

  /* auto-advance processing → result (feels real; calm) */
  useEffect(() => {
    if (state !== 'processing') return;
    const id = setTimeout(() => setTweak('state', 'result'), 1600);
    return () => clearTimeout(id);
  }, [state]);

  const pct = Math.round(((SESSION.idx - 1) / SESSION.total) * 100);
  const R = 52, C = 2 * Math.PI * R;

  return (
    <div className="app" data-furi={t.furigana}>
      <Rail />

      <div className="sh-main">
        {/* top bar */}
        <div className="sh-top">
          <button className="sh-exit" title="Back to clip"
            onClick={() => { window.location.href = 'Player.html'; }}><Ic.close /></button>
          <div className="sh-title">
            <b>Shadowing</b>
            <span>Repeat the line aloud</span>
          </div>
          <div className="sh-progress">
            <div className="sh-bar"><div className="sh-fill" style={{ width: pct + '%' }} /></div>
            <span className="sh-count"><b>{SESSION.idx}</b> / {SESSION.total}</span>
          </div>
          <a className="sh-source" href="Player.html" title="Open source clip">
            <span className="thumb"><Ic.youtube /></span>
            <span className="src-meta">
              <span className="src-ch">{CLIP.channel}</span>
              <span className="src-tm">{CLIP.time}</span>
            </span>
          </a>
        </div>

        {/* stage */}
        <div className="sh-stage">
          <div className="card rise" key={scored ? 'r' : 'p'}>
            <div className="card-kicker">
              <span className="kicker-label"><Ic.mic /> Shadowing · Pronunciation</span>
              <button className="ref-chip" title="Play the reference audio">
                <Ic.volume /> Reference
              </button>
            </div>

            <Sentence scored={scored} />
            <div className="sh-en">{EN}</div>

            {/* ---- result detail ---- */}
            {scored && (
              <div className="sh-result">
                <div className="sh-score">
                  <div className="ring">
                    <svg width="112" height="112" viewBox="0 0 112 112">
                      <circle className="track" cx="56" cy="56" r={R} fill="none" strokeWidth="9" />
                      <circle className="meter" cx="56" cy="56" r={R} fill="none" strokeWidth="9"
                        strokeDasharray={C} strokeDashoffset={C * (1 - SCORE / 100)} />
                    </svg>
                    <div className="ring-num"><b>{SCORE}</b><span>Score</span></div>
                  </div>
                  <div className="score-say">
                    <div className="score-head"><Ic.check /> Close — really natural</div>
                    <div className="score-body">
                      Your rhythm and pacing sounded fluent. One sound to polish: the
                      pitch on <em>川沿い</em>. Give it another go and it'll click.
                    </div>
                  </div>
                </div>

                {/* per-segment notes */}
                <div className="sh-flags">
                  {FLAGS.map((f, i) => (
                    <div key={i} className={'flag' + (f.kind === 'ok' ? ' ok' : '')}>
                      <span className="dot" />
                      <span className="flag-text">{f.body}</span>
                    </div>
                  ))}
                </div>

                {/* prosody */}
                <div className="sh-prosody">
                  {PROSODY.map((m) => (
                    <div key={m.name} className={'metric' + (m.warn ? ' warn' : '')}>
                      <div className="metric-top">
                        <span className="metric-name">{m.name}</span>
                        <span className="metric-val">{m.val}</span>
                      </div>
                      <div className="metric-bar"><i style={{ width: m.val + '%' }} /></div>
                    </div>
                  ))}
                </div>

                {/* A/B compare */}
                <div className="sh-compare">
                  <div className="cmp-row">
                    <button className="cmp-play" title="Play reference"><Ic.play /></button>
                    <span className="cmp-label">Reference</span>
                    <span className="cmp-wave">
                      {refWave.map((h, i) => <i key={i} style={{ height: (h / 9 * 100) + '%' }} />)}
                    </span>
                    <span className="cmp-dur">0:04</span>
                  </div>
                  <div className="cmp-row you">
                    <button className="cmp-play" title="Play your recording"><Ic.play /></button>
                    <span className="cmp-label">You</span>
                    <span className="cmp-wave">
                      {youWave.map((h, i) => (
                        <i key={i} className={youHot.has(i) ? 'hot' : ''} style={{ height: (h / 9 * 100) + '%' }} />
                      ))}
                    </span>
                    <span className="cmp-dur">0:05</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* dock */}
        <div className="sh-dock">
          {state === 'prompt' && (
            <>
              <button className="record-btn" onClick={() => setTweak('state', 'recording')}>
                <span className="mic-dot"><Ic.mic /></span>
                Record
              </button>
              <span className="dock-hint">Listen first, then speak after the clip</span>
            </>
          )}

          {state === 'recording' && (
            <div className="rec-live">
              <div className="rec-meta">
                <span className="live" /> Recording
                <span className="time">{mmss}</span>
              </div>
              <div className="wave active">
                {Array.from({ length: 36 }).map((_, i) => (
                  <i key={i} style={{ animationDelay: (i * 0.05) + 's',
                    animationDuration: (0.85 + (i % 5) * 0.12) + 's' }} />
                ))}
              </div>
              <button className="stop-btn" onClick={() => setTweak('state', 'processing')}>
                <span className="sq"><i /></span> Stop
              </button>
            </div>
          )}

          {state === 'processing' && (
            <div className="sh-proc">
              <div className="proc-dots"><i /><i /><i /></div>
              <span className="proc-label">Scoring your pronunciation…</span>
            </div>
          )}

          {state === 'result' && (
            <div className="sh-actions">
              <button className="btn-ghost" onClick={() => setTweak('state', 'prompt')}>
                <Ic.refresh /> Try again
              </button>
              <button className="btn-next" onClick={() => setTweak('state', 'prompt')}>
                Next <Ic.arrow />
              </button>
            </div>
          )}
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Practice state" />
        <TweakSelect label="State" value={t.state}
          options={['prompt', 'recording', 'processing', 'result']}
          onChange={(v) => setTweak('state', v)} />

        <TweakSection label="Display" />
        <TweakRadio label="Furigana" value={t.furigana}
          options={['on', 'off']} onChange={(v) => setTweak('furigana', v)} />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
