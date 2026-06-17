/* Fuchine — Login / Registro */
const { useState, useEffect, useRef } = React;

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "state": "default",
  "mode": "login",
  "accent": "#1F3A5F"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // form state (mode mirrors tweak so the panel and the in-form toggle stay in sync)
  const [mode, setMode] = useState(t.mode);          // 'login' | 'signup'
  const [phase, setPhase] = useState('idle');        // 'idle' | 'loading' | 'error'
  const [email, setEmail] = useState('mai@fuchi.app');
  const [pw, setPw] = useState('••••••••••');
  const [name, setName] = useState('');
  const timer = useRef(null);

  // tweak-driven overrides
  useEffect(() => { setMode(t.mode); }, [t.mode]);
  useEffect(() => {
    if (t.state === 'loading') setPhase('loading');
    else if (t.state === 'error') setPhase('error');
    else setPhase('idle');
  }, [t.state]);

  // theme + accent on :root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme);
  }, [t.theme]);
  useEffect(() => {
    if (t.accent) document.documentElement.style.setProperty('--accent', t.accent);
    else document.documentElement.style.removeProperty('--accent');
  }, [t.accent]);

  const isSignup = mode === 'signup';
  const loading = phase === 'loading';
  const error = phase === 'error';

  const toggleMode = () => {
    const next = isSignup ? 'login' : 'signup';
    setMode(next);
    setTweak('mode', next);
    setPhase('idle');
    setTweak('state', 'default');
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    setPhase('loading');
    setTweak('state', 'loading');
    clearTimeout(timer.current);
    // demo: resolve into the error state to showcase inline messaging
    timer.current = setTimeout(() => {
      setPhase('error');
      setTweak('state', 'error');
    }, 1700);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="shell">
      {/* ---------- left: form ---------- */}
      <section className="form-panel">
        <div className="wordmark">
          <span className="mark">淵</span>
          <span>Fuchine</span>
        </div>

        <div className="form-center">
          <div className="form-inner">
            <div className="form-head">
              <h1 className="form-title">{isSignup ? 'Criar conta' : 'Entrar'}</h1>
              <p className="form-sub">
                {isSignup
                  ? 'Comece a mergulhar no japonês através do vídeo.'
                  : 'Bem-vindo de volta às profundezas.'}
              </p>
            </div>

            <form onSubmit={onSubmit} noValidate>
              {/* name — only signup */}
              {isSignup && (
                <div className="field reveal" key="name-field">
                  <label className="label" htmlFor="name">Nome</label>
                  <input
                    id="name" className="input" type="text" autoComplete="name"
                    placeholder="Como devemos te chamar?"
                    value={name} onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="field">
                <label className="label" htmlFor="email">E-mail</label>
                <input
                  id="email" className={'input' + (error ? ' invalid' : '')} type="email"
                  autoComplete="email" placeholder="voce@exemplo.com"
                  value={email} onChange={(e) => { setEmail(e.target.value); if (error) setPhase('idle'); }}
                />
              </div>

              <div className="field">
                <div className="field-label-row">
                  <label className="label" htmlFor="pw">Senha</label>
                  {!isSignup && <button type="button" className="link" tabIndex={-1}>Esqueci minha senha</button>}
                </div>
                <input
                  id="pw" className={'input' + (error ? ' invalid' : '')} type="password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={pw} onChange={(e) => { setPw(e.target.value); if (error) setPhase('idle'); }}
                />
              </div>

              <button className="btn-primary" type="submit" disabled={loading}>
                {loading
                  ? <><span className="spinner" /> {isSignup ? 'Criando conta…' : 'Entrando…'}</>
                  : (isSignup ? 'Criar conta' : 'Entrar')}
              </button>

              {error && (
                <div className="error-msg reveal" role="alert">
                  <i className="dot" />
                  <span>E-mail ou senha incorretos. Tente novamente.</span>
                </div>
              )}
            </form>

            <div className="divider">ou</div>

            <button type="button" className="btn-google">
              <GoogleMark />
              Continuar com Google
            </button>

            <p className="form-foot">
              {isSignup ? 'Já tem uma conta?' : 'Não tem conta?'}
              <button type="button" className="toggle" onClick={toggleMode}>
                {isSignup ? 'Entrar' : 'Criar conta'}
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ---------- right: brand field ---------- */}
      <aside className="brand">
        <div className="brand-inner fade-up">
          <div className="hero-kanji">淵</div>
          <div className="hero-reading">ふち ・ fuchi</div>
          <div className="hero-gloss">as profundezas</div>
          <div className="hero-rule" />
          <p className="hero-phrase">言葉の淵に、<br/>静かに沈んでいく。</p>
        </div>

        <div className="caption-nod fade-up">
          <div className="caption-track"><i/><i/><i/></div>
          <div className="caption-bar">
            <span className="caption-jp">言葉に潜る。</span>
            <span className="caption-gloss">mergulhe nas palavras</span>
          </div>
        </div>
      </aside>

      {/* ---------- tweaks ---------- */}
      <TweaksPanel>
        <TweakSection label="Tema" />
        <TweakRadio label="Aparência" value={t.theme}
          options={['light', 'dark']}
          onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Acento 藍" value={t.accent}
          options={['#1F3A5F', '#1B3B66', '#27406B', '#163049']}
          onChange={(v) => setTweak('accent', v)} />

        <TweakSection label="Estado" />
        <TweakRadio label="Formulário" value={t.mode}
          options={['login', 'signup']}
          onChange={(v) => { setTweak('mode', v); setTweak('state', 'default'); }} />
        <TweakSelect label="Estado da tela" value={t.state}
          options={['default', 'loading', 'error']}
          onChange={(v) => setTweak('state', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
