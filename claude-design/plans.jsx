/* Fuchine — Plans & Billing (cloud / hosted)
   Open-core: cloud Pro sells convenience + managed AI, never locked features.
   States: viewing (on Free) · managing (on Pro). */
const { useState, useEffect } = React;

/* a few page-specific glyphs */
Ic.cloud = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M7 18.5a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.5 10 3.75 3.75 0 0 1 16.5 18.5Z" />
  </svg>
);
Ic.card = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 9.5h18" /><path d="M6.5 14.5h3" />
  </svg>
);
Ic.globe = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.3-3.6-8.5S9.6 5.8 12 3.5Z" />
  </svg>
);
Ic.lockOpen = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="4.5" y="11" width="15" height="9" rx="2" /><path d="M8 11V7.5A4 4 0 0 1 15.7 6" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const USER = { name: 'Mai Tanaka', mail: 'mai@fuchi.app' };

/* ---- pricing (shown for Japan ¥; adjusts by region) ---- */
const yen = (n) => '¥' + n.toLocaleString('en-US');
const PLANS = [
  {
    id: 'free', name: 'Free', mo: 0, yr: 0,
    tagline: 'The full open-source app. Self-host it forever, or use it here at no cost.',
    feats: [
      ['Everything in the open-source core', true],
      ['Unlimited videos & sentence mining', false],
      ['SRS review, dictionary, listening & shadowing', false],
      ['Bring your own AI key for explanations', false],
      ['Local-first — your data stays with you', false],
    ],
  },
  {
    id: 'pro', name: 'Pro', mo: 1200, yr: 1000, billedYr: 12000, rec: true,
    tagline: 'Everything in Free, hosted and managed for you — no setup, no keys.',
    feats: [
      ['Everything in Free, run in the cloud', true],
      ['Managed AI — no API keys to configure', false],
      ['Sync across web & mobile', false],
      ['Automatic backup of decks & progress', false],
      ['Higher-quality transcription & translation', false],
      ['Priority processing for long videos', false],
    ],
  },
  {
    id: 'team', name: 'Team / School', mo: 1000, yr: 850, billedYr: 10200, seat: true,
    tagline: 'Pro for every member, with shared libraries and a teacher view.',
    feats: [
      ['Everything in Pro, per member', true],
      ['Shared decks & class libraries', false],
      ['Teacher dashboard & progress overview', false],
      ['Centralized billing & SSO', false],
      ['Roster management & onboarding help', false],
    ],
  },
];

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'settings', icon: Ic.settings, label: 'Settings', href: 'Settings.html', active: true },
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
            <span className="account-name">{USER.name}</span>
            <span className="account-mail">{USER.mail}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

function Row({ title, desc, children, last }) {
  return (
    <div className={'set-row' + (last ? ' last' : '')}>
      <div className="set-rl">
        <div className="set-rt">{title}</div>
        {desc && <div className="set-rd">{desc}</div>}
      </div>
      <div className="set-rc">{children}</div>
    </div>
  );
}
function Group({ icon, title, children }) {
  const I = icon;
  return (
    <section className="set-group">
      <div className="set-gh"><span className="set-gi"><I /></span><h2>{title}</h2></div>
      <div className="set-card">{children}</div>
    </section>
  );
}

/* ---------------- Plan card ---------------- */
function PlanCard({ plan, cycle, current, onChoose }) {
  const free = plan.mo === 0;
  const per = cycle === 'annual' ? plan.yr : plan.mo;
  const billed = free ? 'Free forever'
    : cycle === 'annual' ? `${yen(plan.billedYr)} billed yearly${plan.seat ? ' / seat' : ''}`
    : (plan.seat ? 'per seat, billed monthly' : 'billed monthly');

  let flag = null;
  if (current) flag = <span className="plan-flag cur">Current plan</span>;
  else if (plan.rec) flag = <span className="plan-flag rec">Recommended</span>;

  /* CTA */
  let cta;
  if (current) cta = <button className="pbtn muted"><Ic.check /> Current plan</button>;
  else if (plan.id === 'pro') cta = <button className="pbtn primary" onClick={onChoose}>Upgrade to Pro <Ic.arrow /></button>;
  else if (plan.id === 'free') cta = <button className="pbtn ghost" onClick={onChoose}>Switch to Free</button>;
  else cta = <button className="pbtn ghost" onClick={onChoose}>Choose Team</button>;

  return (
    <div className={'plan' + (plan.rec ? ' rec' : '') + (current ? ' current' : '')}>
      <div className="plan-tagrow">
        <span className="plan-name">{plan.name}</span>
        {flag}
      </div>
      <div className="plan-price">
        <span className="plan-cur">¥</span>
        <span className="plan-num">{per.toLocaleString('en-US')}</span>
        <span className="plan-per">{free ? '' : (plan.seat ? '/ seat · mo' : '/ month')}</span>
      </div>
      <div className="plan-billed">{billed}</div>
      <p className="plan-tagline">{plan.tagline}</p>
      <ul className="plan-feats">
        {plan.feats.map(([f, head], i) => (
          <li key={i} className={head ? '' : 'dim'}>
            <Ic.check />
            <span>{head ? <b>{f}</b> : f}</span>
          </li>
        ))}
      </ul>
      <div className="plan-cta">{cta}</div>
    </div>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "collapsed": false,
  "plan": "free",
  "cycle": "annual"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const onPro = t.plan === 'pro';
  const cycle = t.cycle;
  const setCycle = (v) => setTweak('cycle', v);

  const planCards = (
    <div className="plans">
      {PLANS.map((p) => (
        <PlanCard key={p.id} plan={p} cycle={cycle}
          current={onPro ? p.id === 'pro' : p.id === 'free'}
          onChoose={() => { if (p.id === 'pro') setTweak('plan', 'pro'); else if (p.id === 'free') setTweak('plan', 'free'); }} />
      ))}
    </div>
  );

  const cycleToggle = (
    <div className="cycle-row">
      <div className="cycle">
        <button className={'cycle-b' + (cycle === 'monthly' ? ' on' : '')} onClick={() => setCycle('monthly')}>Monthly</button>
        <button className={'cycle-b' + (cycle === 'annual' ? ' on' : '')} onClick={() => setCycle('annual')}>Annual</button>
      </div>
      <span className="cycle-save">Save ~17% — 2 months free</span>
    </div>
  );

  const regional = (
    <div className="region">
      <Ic.globe />
      <span>Prices shown for <b>Japan (¥)</b> and adjust to your region's purchasing power. Taxes calculated at checkout.</span>
    </div>
  );

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content plans-content">
          {/* head */}
          <div className="bill-head rise">
            <div>
              <h1>Plans &amp; billing</h1>
              <p>Fuchine is open source and free to self-host. The cloud plan runs it for you — managed AI, sync, and backups.</p>
            </div>
            <span className="cloud-tag"><Ic.cloud /> Cloud · hosted</span>
          </div>

          {/* ---- MANAGING (pro): subscription + billing first ---- */}
          {onPro && (
            <div className="rise-2">
              <div className="sub-banner">
                <div className="sub-l">
                  <span className="sub-mark">淵</span>
                  <div>
                    <div className="sub-name">Fuchine Pro · Annual
                      <span className="sub-status"><i /> Active</span>
                    </div>
                    <div className="sub-renew">Renews <b>Apr 14, 2027</b> · auto-renew on</div>
                  </div>
                </div>
                <div className="sub-r">
                  <div className="sub-amt">{yen(12000)}<span> / year</span></div>
                </div>
              </div>

              <Group icon={Ic.card} title="Billing">
                <Row title="Payment method" desc="Charged automatically each cycle.">
                  <div className="pay-method">
                    <span className="pay-card"><Ic.card /></span>
                    <span className="pay-meta">
                      <span className="pay-no">Visa ···· 4242</span>
                      <span className="pay-exp">Expires 08 / 27</span>
                    </span>
                  </div>
                  <button className="btn-ghost sm">Update</button>
                </Row>
                <Row title="Billing cycle" desc="Annual saves about 17% over monthly.">
                  <div className="seg">
                    <button className={'seg-b' + (cycle === 'monthly' ? ' on' : '')} onClick={() => setCycle('monthly')}>Monthly</button>
                    <button className={'seg-b' + (cycle === 'annual' ? ' on' : '')} onClick={() => setCycle('annual')}>Annual</button>
                  </div>
                </Row>
                <Row title="Billing email" desc="Where receipts and invoices are sent.">
                  <span className="static-val">{USER.mail}</span>
                </Row>
                <Row title="Invoices" desc="Last charge · Apr 14, 2026 · ¥12,000" last>
                  <button className="btn-ghost sm"><Ic.download /> View all</button>
                </Row>
              </Group>

              <Group icon={Ic.settings} title="Subscription">
                <Row title="Cancel subscription"
                  desc="You'll keep Pro until Apr 14, 2027, then move to Free. Your decks and progress stay — they export anytime." last>
                  <button className="btn-ghost sm danger">Cancel</button>
                </Row>
              </Group>

              <div className="change-head">Change plan</div>
              {cycleToggle}
              {planCards}
              {regional}
            </div>
          )}

          {/* ---- VIEWING (free): plans first, then honesty ---- */}
          {!onPro && (
            <div className="rise-2">
              {cycleToggle}
              {planCards}
              {regional}

              <div className="opencore">
                <span className="oc-ic"><Ic.lockOpen /></span>
                <div className="oc-body">
                  <h3>Cloud Pro sells convenience, not features</h3>
                  <p>
                    Every learning feature lives in the <b>free, open-source core</b> — and always will.
                    You can self-host Fuchine forever at no cost and connect your own AI key.
                    Cloud Pro simply runs it for you: <b>managed AI</b> so you skip API-key setup,
                    plus sync and backups. We don't paywall the core, and we never will.
                  </p>
                  <a className="oc-link" href="#">Read the self-hosting guide <Ic.arrow /></a>
                </div>
              </div>
            </div>
          )}

          <div className="bill-foot">
            Questions about billing? <a href="#">Contact support</a> · <a href="#">Open-core promise</a>
          </div>
        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Billing state" />
        <TweakRadio label="Plan" value={t.plan}
          options={['free', 'pro']} onChange={(v) => setTweak('plan', v)} />
        <TweakRadio label="Cycle" value={t.cycle}
          options={['monthly', 'annual']} onChange={(v) => setTweak('cycle', v)} />

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
