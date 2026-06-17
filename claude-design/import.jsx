/* Fuchine — Import video modal flow */
const { useState, useEffect, useRef } = React;

const VIDEO = {
  title: 'ニュースで学ぶ日本語：今日の天気予報と週末の過ごし方',
  channel: 'NHK やさしい日本語',
  dur: '6:48',
  url: 'https://youtube.com/watch?v=k9Jp2x7',
};

const Thumb = ({ dur, sm, cls = '' }) => (
  <div className={'thumb ' + (sm ? 'sm ' : '') + cls}>
    <span className="play"><Ic.play /></span>
    {dur && <span className="dur">{dur}</span>}
  </div>
);

/* ---------- the seven states ---------- */

function Empty({ go }) {
  const [v, setV] = useState('');
  return (
    <div className="state-fade">
      <p className="paste-label">Paste a link to any Japanese YouTube video and we'll prepare it for study.</p>
      <div className="paste-field">
        <Ic.youtube className="yt" />
        <input className="paste-input" autoFocus value={v} onChange={(e) => setV(e.target.value)}
          placeholder="Paste a YouTube link" />
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary btn-block" onClick={() => go('validating')}>Import</button>
      </div>
    </div>
  );
}

function Validating() {
  return (
    <div className="state-fade">
      <div className="validating">
        <span className="spinner ink" />
        <div className="v-text">
          <p className="t">Checking video…</p>
          <p className="s">Looking for Japanese subtitles.</p>
        </div>
      </div>
      <p className="v-url">{VIDEO.url}</p>
    </div>
  );
}

function ValidPreview({ go }) {
  return (
    <div className="state-fade">
      <div className="preview">
        <Thumb dur={VIDEO.dur} />
        <div className="preview-meta">
          <p className="p-title jp">{VIDEO.title}</p>
          <div className="p-row">
            <span className="p-chan">{VIDEO.channel}</span>
            <span className="dot" />
            <span><Ic.clock /></span>
            <span>{VIDEO.dur}</span>
          </div>
        </div>
      </div>

      <div className="subs-found">
        <span className="ic"><Ic.check /></span>
        <span className="sf-text"><b>Japanese subtitles found</b> — ready to study.</span>
      </div>

      <div className="track-select">
        <p className="ts-label">Subtitle track</p>
        <div className="track-dd">
          <select defaultValue="ja">
            <option value="ja">Japanese (closed captions)</option>
            <option value="ja-auto">Japanese (auto-generated)</option>
            <option value="en">English (translation)</option>
          </select>
          <Ic.chevDown className="chev" />
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-primary btn-block" onClick={() => go('processing')}>
          <Ic.spark /> Start studying
        </button>
      </div>
    </div>
  );
}

function Reject({ go }) {
  return (
    <div className="state-fade">
      <div className="reject-vid">
        <Thumb sm cls="" />
        <p className="rv-title jp">{VIDEO.title}</p>
      </div>
      <div className="notice reject">
        <span className="n-ic"><Ic.caption /></span>
        <p className="n-title">No Japanese subtitles yet</p>
        <p className="n-body">
          This video doesn't have Japanese subtitles, so it can't be studied yet.
          Try another video — most NHK, vlog, and news channels include them.
        </p>
        <span className="n-hint"><Ic.spark /> Auto-transcription is coming soon.</span>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-block" onClick={() => go('empty')}>Try another video</button>
      </div>
    </div>
  );
}

const PIPELINE = [
  { key: 'fetch', label: 'Fetching subtitles' },
  { key: 'analyze', label: 'Analyzing words' },
  { key: 'translate', label: 'Translating' },
];

function Processing({ go }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= PIPELINE.length) { const t = setTimeout(() => go('done'), 500); return () => clearTimeout(t); }
    const t = setTimeout(() => setStep((s) => s + 1), 1300);
    return () => clearTimeout(t);
  }, [step]);

  const pct = Math.min(100, Math.round(((step + 0.4) / PIPELINE.length) * 100));

  return (
    <div className="state-fade processing">
      <p className="proc-head">Preparing your study session…</p>
      <p className="proc-sub">This usually takes a few seconds. You can keep it open.</p>

      <div className="proc-bar"><i style={{ width: pct + '%' }} /></div>

      <div className="steps">
        {PIPELINE.map((s, i) => {
          const cls = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <div className={'step ' + cls} key={s.key}>
              <span className="s-ic">
                {cls === 'done' ? <Ic.check />
                  : cls === 'active' ? <span className="spinner ink" />
                  : <span className="s-num">{i + 1}</span>}
              </span>
              <span className="s-label">{s.label}</span>
              {cls === 'done' && <span className="s-aside"><Ic.check /></span>}
              {cls === 'active' && <span className="s-aside">Working…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Done({ go }) {
  return (
    <div className="state-fade">
      <div className="notice done-state">
        <span className="n-ic success-pop"><Ic.check /></span>
        <p className="n-title">Ready!</p>
        <p className="n-body">Your study session is prepared. Subtitles, dictionary, and review cards are all set.</p>
      </div>
      <div className="done-meta">
        <Thumb sm dur={VIDEO.dur} />
        <div>
          <div className="dm-t jp">{VIDEO.title}</div>
          <div className="dm-s">{VIDEO.channel} · 142 words · 23 new</div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary btn-block"><Ic.play /> Start studying</button>
      </div>
    </div>
  );
}

function Failed({ go }) {
  return (
    <div className="state-fade">
      <div className="notice fail">
        <span className="n-ic"><Ic.alert /></span>
        <p className="n-title">Something went wrong</p>
        <p className="n-body">We couldn't finish preparing this video. Please check your connection and try again.</p>
        <p className="fail-reason">Error: subtitle fetch timed out</p>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-grow" onClick={() => go('empty')}>Cancel</button>
        <button className="btn btn-primary btn-grow" onClick={() => go('processing')}>
          <Ic.refresh /> Try again
        </button>
      </div>
    </div>
  );
}

const STATES = {
  empty: Empty, validating: Validating, valid: ValidPreview,
  reject: Reject, processing: Processing, done: Done, failed: Failed,
};

/* ---------- App ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "empty"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [state, setState] = useState(t.state);

  useEffect(() => { setState(t.state); }, [t.state]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  useEffect(() => { window.__go = (s) => { setState(s); setTweak('state', s); }; }, []);

  // advance to the next state (used by in-modal buttons)
  const go = (next) => {
    setState(next);
    setTweak('state', next);
  };

  // auto-advance from validating to a result
  useEffect(() => {
    if (state === 'validating') {
      const id = setTimeout(() => go('valid'), 1500);
      return () => clearTimeout(id);
    }
  }, [state]);

  const Current = STATES[state] || Empty;

  return (
    <div className="import-stage">
      <div className="app-ghost"><div className="g-side" /></div>

      <div className="scrim">
        <div className="modal modal-anim">
          <div className="modal-head">
            <span className="hmark"><Ic.youtube /></span>
            <span className="htitle">Import video</span>
            <button className="hclose" aria-label="Close" onClick={() => { window.location.href = 'Dashboard.html'; }}><Ic.close /></button>
          </div>
          <div className="modal-body">
            <Current go={go} />
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />

        <TweakSection label="Flow state" />
        <TweakSelect label="State" value={t.state}
          options={['empty', 'validating', 'valid', 'reject', 'processing', 'done', 'failed']}
          onChange={(v) => setTweak('state', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
