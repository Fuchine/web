/* Fuchine — Plans / Billing (cloud only) */
const { useState, useEffect } = React;

/* ---------------- Sidebar (matches settings) ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'settings', icon: Ic.settings, label: 'Settings', active: true, href: 'Settings.html' },
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

/* ---------------- Segmented (cycle toggle) ---------------- */
function Segmented({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={'seg-b' + (value === o.v ? ' on' : '')}
          onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

/* ---------------- Plan card ---------------- */
const PLANS = [
  {
    key: 'free',
    name: 'Free',
    monthly: 0, annual: 0,
    desc: 'For self-hosters and BYOK.',
    features: ['All core features', 'Bring your own API key', 'Self-hostable, AGPL-3.0', 'Unlimited videos'],
    current: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthly: 8, annual: 6,
    desc: 'Managed AI, no setup, cloud hosting.',
    features: ['Everything in Free', 'Managed AI — no API key needed', 'Cloud hosting, no Docker', 'Priority import queue', 'Email support'],
    recommended: true,
    cta: 'Upgrade to Pro',
  },
  {
    key: 'team',
    name: 'Team / School',
    monthly: 24, annual: 19,
    desc: 'Shared workspace for classes and groups.',
    features: ['Everything in Pro', 'Shared workspace', 'Admin dashboard', 'Volume pricing', 'Dedicated support'],
    cta: 'Contact us',
    ghost: true,
  },
];

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

function PlanCard({ plan, cycle }) {
  const price = cycle === 'annual' ? plan.annual : plan.monthly;
  return (
    <div className={'plan-card' + (plan.recommended ? ' recommended' : '')}>
      <div className="plan-card-top">
        <h3 className="plan-name">{plan.name}</h3>
        {plan.current && <span className="plan-current">Current plan</span>}
        {plan.recommended && <span className="plan-tag">Recommended</span>}
      </div>
      <div className="plan-price">
        <span className="v">${price}</span>
        <span className="per">/mo</span>
      </div>
      <p className="plan-desc">{plan.desc}</p>
      <ul className="plan-features">
        {plan.features.map((f, i) => (
          <li key={i}>
            <span className="fic"><Check /></span>
            {f}
          </li>
        ))}
      </ul>
      {plan.cta && !plan.current && (
        plan.ghost
          ? <button className="btn-ghost">{plan.cta}</button>
          : <button className="btn-primary">{plan.cta}</button>
      )}
    </div>
  );
}

/* ---------------- FAQ ---------------- */
const FAQS = [
  { q: 'What happens if I cancel?', a: 'You keep all your data. Access reverts to the Free plan at the end of the billing period.' },
  { q: 'Can I use my own API key on Pro?', a: 'Yes. BYOK works on every plan. Pro adds managed AI as a convenience.' },
  { q: 'Is there regional pricing?', a: 'Yes. Pricing adjusts to your region at checkout.' },
  { q: 'How is usage measured?', a: 'By AI cost: imports (batch translation) and per-line explanations. Self-host usage is never metered.' },
];

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

  const [cycle, setCycle] = useState('annual');

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content plans-content">
          <div className="plans-head rise">
            <div>
              <h1>Plans</h1>
              <p>Cloud convenience, not locked features.</p>
            </div>
            <div className="cycle-cluster">
              <Segmented value={cycle} onChange={setCycle}
                options={[{v:'monthly',l:'Monthly'},{v:'annual',l:'Annual'}]} />
              <span className="save-badge">Save 20%</span>
            </div>
          </div>

          <div className="plans-grid rise-2">
            {PLANS.map((p) => <PlanCard key={p.key} plan={p} cycle={cycle} />)}
          </div>

          <div className="trust-note rise-3">
            <span className="ico">淵</span>
            <p className="t">Fuchine is open core. Everything in Pro runs self-hosted too — Pro is about convenience, not locked features.</p>
          </div>

          <div className="plans-faq rise-3">
            <div className="set-gh"><h2>Questions</h2></div>
            <div className="faq-card">
              {FAQS.map((f, i) => (
                <div key={i} className="faq-row">
                  <div className="faq-q">{f.q}</div>
                  <div className="faq-a">{f.a}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="plans-foot">Fuchine · Self-hostable, AGPL-3.0</div>
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
