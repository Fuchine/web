/* Fuchine — Onboarding (first-run setup) */
const { useState, useEffect } = React;

/* ---- local glyphs not in the shared set ---- */
const EyeIc = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z"/>
    <circle cx="12" cy="12" r="2.9"/>
  </svg>
);
const LockIc = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="5" y="10.6" width="14" height="9.4" rx="2.2"/>
    <path d="M8 10.6V7.7a4 4 0 0 1 8 0v2.9"/>
  </svg>
);
const InfoIc = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="8.5"/>
    <path d="M12 11v5"/><path d="M12 8h.01"/>
  </svg>
);

/* ---------- step order ---------- */
const STEPS = ['welcome', 'language', 'key', 'done'];
const NUMBERED = ['welcome', 'language', 'key']; // "Step n of 3"

/* ---------- progress ---------- */
function Progress({ step }) {
  const idx = NUMBERED.indexOf(step);
  const current = idx < 0 ? NUMBERED.length : idx; // done → all filled
  return (
    <div className="ob-progress">
      <div className="ob-track">
        {NUMBERED.map((_, i) => (
          <i key={i} className={i < current ? 'done' : i === current ? 'on' : ''} />
        ))}
      </div>
      <span className="ob-step-label">
        {idx < 0 ? 'Setup complete' : `Step ${idx + 1} of ${NUMBERED.length}`}
      </span>
    </div>
  );
}

/* ---------- step 1: welcome ---------- */
function StepWelcome({ onNext, onSkip, name }) {
  return (
    <div className="ob-anim" key="welcome">
      <Progress step="welcome" />
      <span className="ob-eyebrow"><span className="ko">淵</span> Welcome</span>
      <h1 className="ob-title">{name ? `Welcome to Fuchine, ${name}.` : 'Welcome to Fuchine.'}</h1>
      <p className="ob-sub">
        Learn Japanese by watching real videos — with <span className="em">smart dual
        subtitles</span> that translate and explain, line by line, as you watch.
      </p>

      <div className="ob-demo">
        <div className="ob-demo-frame">
          <span className="cc"><Ic.caption /></span>
          <span>Dual subtitles</span>
          <span className="grow" />
          <span className="ts">02:14</span>
        </div>
        <div className="ob-demo-jp">水の<b>淵</b>に、静かに沈んでいく。</div>
        <div className="ob-demo-en">Sinking quietly into the depths of the water.</div>
        <div className="ob-demo-track"><i/><i/><i/><i/></div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onNext}>
          Get started <Ic.arrow />
        </button>
        <div className="ob-sub-actions">
          <button className="ob-quiet" onClick={onSkip}>Skip setup</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- step 2: explanation language ---------- */
const LANGS = [
  { v: 'en', name: 'English', native: 'English', flag: 'Recommended' },
  { v: 'pt', name: 'Português', native: 'Portuguese', flag: '' },
  { v: 'es', name: 'Español', native: 'Spanish', flag: '' },
  { v: 'zh', name: '中文', native: 'Chinese (Simplified)', flag: '' },
  { v: 'ko', name: '한국어', native: 'Korean', flag: '' },
];

function StepLanguage({ value, onChange, onNext, onBack, onSkip }) {
  return (
    <div className="ob-anim" key="language">
      <Progress step="language" />
      <span className="ob-eyebrow">Explanations</span>
      <h1 className="ob-title">Which language should Fuchine explain in?</h1>
      <p className="ob-sub">
        Translations and AI explanations will appear in this language — it's how Fuchine
        explains things <span className="em">to you</span>. Change it anytime in Settings.
      </p>

      <div className="ob-opts" role="radiogroup" aria-label="Explanation language">
        {LANGS.map((l) => (
          <button
            key={l.v}
            role="radio"
            aria-checked={value === l.v}
            className={'ob-opt' + (value === l.v ? ' on' : '')}
            onClick={() => onChange(l.v)}
          >
            <span className="ob-radio"><i /></span>
            <span className="ob-opt-text">
              <span className="ob-opt-name">{l.name}</span>
              {l.native !== l.name && <span className="ob-opt-native">{l.native}</span>}
            </span>
            {l.flag && <span className="ob-opt-flag">{l.flag}</span>}
          </button>
        ))}
      </div>

      <div className="ob-fixed">
        <span className="lock"><LockIc /></span>
        <span className="grow">
          You're learning <span className="jpchip">日本語 · Japanese</span>
        </span>
        <span className="tag">FIXED FOR NOW</span>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onNext}>
          Continue <Ic.arrow />
        </button>
        <div className="ob-sub-actions">
          <button className="ob-quiet" onClick={onBack}>Back</button>
          <span className="dot" />
          <button className="ob-quiet" onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- step 3: AI key (BYOK) ---------- */
const PROVIDERS = [
  { v: 'anthropic', l: 'Anthropic', ph: 'sk-ant-…' },
  { v: 'openai', l: 'OpenAI', ph: 'sk-…' },
  { v: 'gemini', l: 'Gemini', ph: 'AIza…' },
  { v: 'local', l: 'Local', ph: 'http://localhost:11434' },
];

function StepKey({ provider, onProvider, keyVal, onKey, onFinish, onBack, onSkip }) {
  const [show, setShow] = useState(false);
  const prov = PROVIDERS.find((p) => p.v === provider) || PROVIDERS[0];
  const isLocal = provider === 'local';

  return (
    <div className="ob-anim" key="key">
      <Progress step="key" />
      <span className="ob-eyebrow">AI key · Optional</span>
      <h1 className="ob-title">Bring your own AI key</h1>
      <p className="ob-sub">
        Paste a key to switch on AI translation and explanations. Fuchine self-hosts your
        key — it's <span className="em">encrypted at rest</span>, never shared, never logged.
      </p>

      <div className="ob-seg" role="tablist" aria-label="Provider">
        {PROVIDERS.map((p) => (
          <button
            key={p.v}
            role="tab"
            aria-selected={provider === p.v}
            className={'ob-seg-b' + (provider === p.v ? ' on' : '')}
            onClick={() => onProvider(p.v)}
          >
            {p.l}
          </button>
        ))}
      </div>

      <div className="ob-keyrow">
        <span className="label">{isLocal ? 'Endpoint' : 'API key'}</span>
        <button className="ob-howto">How to get a key</button>
      </div>
      <div className="ob-key">
        <input
          className="input"
          type={show || isLocal ? 'text' : 'password'}
          placeholder={prov.ph}
          value={keyVal}
          onChange={(e) => onKey(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        {!isLocal && (
          <button
            className="ob-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide key' : 'Show key'}
            type="button"
          >
            {show ? <Ic.eyeOff /> : <EyeIc />}
          </button>
        )}
      </div>

      <div className="ob-secure">
        <span className="lock"><LockIc /></span>
        <span>Stored encrypted on your account. You can rotate or remove it anytime in Settings.</span>
      </div>

      <div className="ob-note">
        <span className="ni"><InfoIc /></span>
        <p>
          <span className="em">No key? You're still set.</span> Dictionary lookups and
          sentence tokenization work fully without one. Turn on AI translation later in Settings.
        </p>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onFinish}>
          {keyVal.trim() ? 'Save & finish' : 'Finish'} <Ic.check />
        </button>
        <div className="ob-sub-actions">
          <button className="ob-quiet" onClick={onBack}>Back</button>
          <span className="dot" />
          <button className="ob-quiet" onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- done ---------- */
function StepDone({ onEnter }) {
  return (
    <div className="ob-anim ob-done" key="done">
      <Progress step="done" />
      <div className="ob-check"><Ic.check /></div>
      <h1 className="ob-title">You're all set.</h1>
      <p className="ob-sub">Your space is ready. Dive in whenever you are — everything else can be tuned later in Settings.</p>
      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onEnter}>
          Enter Fuchine <Ic.arrow />
        </button>
      </div>
    </div>
  );
}

/* ---------- app ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#1F3A5F",
  "step": "welcome",
  "lang": "en",
  "provider": "anthropic"
}/*EDITMODE-END*/;

const DASHBOARD = 'Dashboard.html';

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [step, setStep] = useState(t.step);
  const [lang, setLang] = useState(t.lang);
  const [provider, setProvider] = useState(t.provider);
  const [keyVal, setKeyVal] = useState('');

  // tweak-driven previews
  useEffect(() => { setStep(t.step); }, [t.step]);
  useEffect(() => { setLang(t.lang); }, [t.lang]);
  useEffect(() => { setProvider(t.provider); }, [t.provider]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  useEffect(() => {
    if (t.accent) document.documentElement.style.setProperty('--accent', t.accent);
    else document.documentElement.style.removeProperty('--accent');
  }, [t.accent]);

  const go = (s) => { setStep(s); setTweak('step', s); };
  const enter = () => { window.location.href = DASHBOARD; };
  const setLanguage = (v) => { setLang(v); setTweak('lang', v); };
  const setProv = (v) => { setProvider(v); setTweak('provider', v); };

  return (
    <div className="ob">
      <div className="ob-watermark" aria-hidden="true">淵</div>

      <header className="ob-top">
        <div className="ob-wordmark">
          <span className="mark">淵</span>
          <span>Fuchine</span>
        </div>
        {step !== 'done' && (
          <button className="ob-escape" onClick={enter} title="You can finish setup later in Settings">
            Set up later
          </button>
        )}
      </header>

      <main className="ob-stage">
        <div className="ob-inner">
          {step === 'welcome' && (
            <StepWelcome name="Mai" onNext={() => go('language')} onSkip={enter} />
          )}
          {step === 'language' && (
            <StepLanguage
              value={lang}
              onChange={setLanguage}
              onNext={() => go('key')}
              onBack={() => go('welcome')}
              onSkip={enter}
            />
          )}
          {step === 'key' && (
            <StepKey
              provider={provider}
              onProvider={setProv}
              keyVal={keyVal}
              onKey={setKeyVal}
              onFinish={() => go('done')}
              onBack={() => go('language')}
              onSkip={enter}
            />
          )}
          {step === 'done' && <StepDone onEnter={enter} />}

          {step !== 'done' && (
            <div className="ob-foot">
              <LockIc />
              You can skip any step and finish setup later in Settings.
            </div>
          )}
        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Flow" />
        <TweakSelect label="Step" value={t.step}
          options={['welcome', 'language', 'key', 'done']}
          onChange={(v) => go(v)} />

        <TweakSection label="Step 2 · Language" />
        <TweakSelect label="Explain in" value={t.lang}
          options={['en', 'pt', 'es', 'zh', 'ko']}
          onChange={setLanguage} />

        <TweakSection label="Step 3 · AI key" />
        <TweakSelect label="Provider" value={t.provider}
          options={['anthropic', 'openai', 'gemini', 'local']}
          onChange={setProv} />

        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']}
          onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Accent 藍" value={t.accent}
          options={['#1F3A5F', '#1B3B66', '#27406B', '#163049']}
          onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
