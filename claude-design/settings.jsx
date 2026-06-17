/* Fuchine — Settings */
const { useState, useEffect } = React;

/* ---------------- Sidebar (matches dashboard) ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'settings', icon: Ic.settings, label: 'Settings', active: true },
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

/* ---------------- Controls ---------------- */
function Switch({ on, onClick }) {
  return (
    <button className={'switch' + (on ? ' on' : '')} onClick={onClick} role="switch" aria-checked={on}>
      <span className="knob" />
    </button>
  );
}
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
function Select({ value, options, onChange }) {
  return (
    <div className="sel">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <Ic.chevDown />
    </div>
  );
}
function Stepper({ value, step, min, max, onChange }) {
  const set = (n) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="stepper">
      <button onClick={() => set(value - step)} aria-label="decrease">−</button>
      <span>{value}</span>
      <button onClick={() => set(value + step)} aria-label="increase">+</button>
    </div>
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

  // local settings state (visual only)
  const [s, setS] = useState({
    furigana: 'always', romaji: false, autopause: true,
    dual: true, subSize: 'm', speed: '1', loop: true,
    newCards: 20, reviewLimit: 200, cardType: 'cloze',
    reduceMotion: false, reminder: true, reminderTime: '20:00',
  });
  const up = (k, v) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content set-content">
          <div className="set-head rise">
            <h1>Settings</h1>
            <p>Manage your account, learning preferences, and how Fuchine plays back video.</p>
          </div>

          {/* Account */}
          <div className="rise-2">
          <Group icon={Ic.home} title="Account">
            <div className="set-row acc-row">
              <div className="acc-id">
                <span className="acc-av">M</span>
                <div>
                  <div className="acc-name">Mai Tanaka</div>
                  <div className="acc-mail">mai@fuchi.app</div>
                </div>
              </div>
              <div className="set-rc">
                <span className="plan-badge">Free plan</span>
                <button className="btn-ghost sm">Manage</button>
              </div>
            </div>
            <Row title="Interface language" desc="Language for menus and the app — not what you study." last>
              <Select value="en" options={[{v:'en',l:'English'},{v:'ja',l:'日本語'},{v:'pt',l:'Português'}]} onChange={() => {}} />
            </Row>
          </Group>
          </div>

          {/* Learning */}
          <div className="rise-3">
          <Group icon={Ic.library} title="Learning">
            <Row title="Studying" desc="The language you're learning from your videos.">
              <span className="static-val jp">日本語 · Japanese</span>
            </Row>
            <Row title="Furigana" desc="Reading aids above kanji in subtitles and the dictionary.">
              <Segmented value={s.furigana} onChange={(v) => up('furigana', v)}
                options={[{v:'always',l:'Always'},{v:'hover',l:'On hover'},{v:'off',l:'Off'}]} />
            </Row>
            <Row title="Show romaji" desc="Romanized readings alongside kana. Off is recommended.">
              <Switch on={s.romaji} onClick={() => up('romaji', !s.romaji)} />
            </Row>
            <Row title="Auto-pause on a new word" desc="Pause the video when an unknown word first appears." last>
              <Switch on={s.autopause} onClick={() => up('autopause', !s.autopause)} />
            </Row>
          </Group>
          </div>

          {/* Subtitles & playback */}
          <div className="rise-3">
          <Group icon={Ic.caption} title="Subtitles & playback">
            <Row title="Dual subtitles" desc="Show the target line and a translation together.">
              <Switch on={s.dual} onClick={() => up('dual', !s.dual)} />
            </Row>
            <Row title="Subtitle size">
              <Segmented value={s.subSize} onChange={(v) => up('subSize', v)}
                options={[{v:'s',l:'Small'},{v:'m',l:'Medium'},{v:'l',l:'Large'}]} />
            </Row>
            <Row title="Default playback speed">
              <Segmented value={s.speed} onChange={(v) => up('speed', v)}
                options={[{v:'0.75',l:'0.75×'},{v:'1',l:'1.0×'},{v:'1.25',l:'1.25×'}]} />
            </Row>
            <Row title="Loop the current line by default" desc="Repeat a subtitle line until you move on." last>
              <Switch on={s.loop} onClick={() => up('loop', !s.loop)} />
            </Row>
          </Group>
          </div>

          {/* Review */}
          <div className="rise-3">
          <Group icon={Ic.review} title="Review">
            <Row title="New cards per day" desc="How many freshly mined cards to introduce daily.">
              <Stepper value={s.newCards} step={5} min={0} max={100} onChange={(v) => up('newCards', v)} />
            </Row>
            <Row title="Maximum reviews per day" desc="Cap on cards due in a single session.">
              <Stepper value={s.reviewLimit} step={25} min={25} max={500} onChange={(v) => up('reviewLimit', v)} />
            </Row>
            <Row title="Card style" desc="How mined sentences are quizzed." last>
              <Segmented value={s.cardType} onChange={(v) => up('cardType', v)}
                options={[{v:'cloze',l:'Cloze'},{v:'word',l:'Word → meaning'}]} />
            </Row>
          </Group>
          </div>

          {/* Appearance */}
          <div className="rise-3">
          <Group icon={Ic.spark} title="Appearance">
            <Row title="Theme">
              <Segmented value={t.theme} onChange={(v) => setTweak('theme', v)}
                options={[{v:'light',l:'Light'},{v:'dark',l:'Dark'}]} />
            </Row>
            <Row title="Reduce motion" desc="Minimize animations and transitions." last>
              <Switch on={s.reduceMotion} onClick={() => up('reduceMotion', !s.reduceMotion)} />
            </Row>
          </Group>
          </div>

          {/* Notifications */}
          <div className="rise-3">
          <Group icon={Ic.clock} title="Notifications">
            <Row title="Daily review reminder" desc="A gentle nudge when cards are due.">
              <Switch on={s.reminder} onClick={() => up('reminder', !s.reminder)} />
            </Row>
            <Row title="Reminder time" last>
              <Select value={s.reminderTime} onChange={(v) => up('reminderTime', v)}
                options={[{v:'08:00',l:'8:00 AM'},{v:'12:00',l:'12:00 PM'},{v:'18:00',l:'6:00 PM'},{v:'20:00',l:'8:00 PM'}]} />
            </Row>
          </Group>
          </div>

          {/* Data */}
          <div className="rise-3">
          <Group icon={Ic.download} title="Data">
            <Row title="Export deck" desc="Download your mined cards as an Anki package.">
              <button className="btn-ghost sm"><Ic.download /> Export .apkg</button>
            </Row>
            <Row title="Sign out" desc="You can sign back in any time." last>
              <button className="btn-ghost sm danger">Sign out</button>
            </Row>
          </Group>
          </div>

          <div className="set-foot">Fuchine · v0.4 · <a href="#">What's new</a></div>
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
