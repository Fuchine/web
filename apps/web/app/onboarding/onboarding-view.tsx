"use client";

import "./onboarding.css";
import { useState } from "react";
import { useRouter } from "next/navigation";

/* ---- icons ---- */
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);
const CaptionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7 11.5h2.5M7 14.5h4" />
    <path d="M13.5 11.5H17M13.5 14.5h2" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="10.6" width="14" height="9.4" rx="2.2" />
    <path d="M8 10.6V7.7a4 4 0 0 1 8 0v2.9" />
  </svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" /><path d="M12 8h.01" />
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z" />
    <circle cx="12" cy="12" r="2.9" />
  </svg>
);
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4l16 16" />
    <path d="M9.9 5.4A8.6 8.6 0 0 1 12 5.2c5 0 8.5 4.4 8.5 6.8a10 10 0 0 1-2.2 3" />
    <path d="M6.4 7.1C4.2 8.4 2.5 10.6 2.5 12c0 2.4 3.5 6.8 9.5 6.8a9.3 9.3 0 0 0 3.6-.7" />
    <path d="M9.8 9.9a3 3 0 0 0 4.1 4.1" />
  </svg>
);

/* ---- types ---- */
type Step = "welcome" | "language" | "key" | "done";
const NUMBERED: Step[] = ["welcome", "language", "key"];

const LANGS = [
  { v: "en", name: "English",   native: "English",              flag: "Recommended" },
  { v: "pt", name: "Português", native: "Portuguese",           flag: "" },
  { v: "es", name: "Español",   native: "Spanish",              flag: "" },
  { v: "zh", name: "中文",       native: "Chinese (Simplified)", flag: "" },
  { v: "ko", name: "한국어",     native: "Korean",               flag: "" },
];

const PROVIDERS = [
  { v: "anthropic", l: "Anthropic", ph: "sk-ant-…" },
  { v: "openai",    l: "OpenAI",    ph: "sk-…" },
  { v: "gemini",    l: "Gemini",    ph: "AIza…" },
  { v: "local",     l: "Local",     ph: "http://localhost:11434" },
];

/* ---- Progress ---- */
function Progress({ step }: { step: Step }) {
  const idx = NUMBERED.indexOf(step);
  const current = idx < 0 ? NUMBERED.length : idx;
  return (
    <div className="ob-progress">
      <div className="ob-track">
        {NUMBERED.map((_, i) => (
          <i key={i} className={i < current ? "done" : i === current ? "on" : ""} />
        ))}
      </div>
      <span className="ob-step-label">
        {idx < 0 ? "Setup complete" : `Step ${idx + 1} of ${NUMBERED.length}`}
      </span>
    </div>
  );
}

/* ---- Step 1: Welcome ---- */
function StepWelcome({ name, onNext, onSkip }: { name: string; onNext: () => void; onSkip: () => void }) {
  return (
    <div key="welcome" className="ob-anim">
      <Progress step="welcome" />
      <span className="ob-eyebrow"><span className="ko">淵</span> Welcome</span>
      <h1 className="ob-title">
        {name ? `Welcome to Fuchine, ${name}.` : "Welcome to Fuchine."}
      </h1>
      <p className="ob-sub">
        Learn Japanese by watching real videos — with{" "}
        <span className="em">smart dual subtitles</span> that translate and explain,
        line by line, as you watch.
      </p>

      <div className="ob-demo">
        <div className="ob-demo-frame">
          <span className="cc"><CaptionIcon /></span>
          <span>Dual subtitles</span>
          <span className="grow" />
          <span className="ts">02:14</span>
        </div>
        <div className="ob-demo-jp">水の<b>淵</b>に、静かに沈んでいく。</div>
        <div className="ob-demo-en">Sinking quietly into the depths of the water.</div>
        <div className="ob-demo-track"><i /><i /><i /><i /></div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onNext}>
          Get started <ArrowIcon />
        </button>
        <div className="ob-sub-actions">
          <button className="ob-quiet" onClick={onSkip}>Skip setup</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Step 2: Language ---- */
function StepLanguage({
  value, onChange, onNext, onBack, onSkip,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div key="language" className="ob-anim">
      <Progress step="language" />
      <span className="ob-eyebrow">Explanations</span>
      <h1 className="ob-title">Which language should Fuchine explain in?</h1>
      <p className="ob-sub">
        Translations and AI explanations will appear in this language — it&apos;s how
        Fuchine explains things <span className="em">to you</span>. Change it anytime in
        Settings.
      </p>

      <div className="ob-opts" role="radiogroup" aria-label="Explanation language">
        {LANGS.map((l) => (
          <button
            key={l.v}
            role="radio"
            aria-checked={value === l.v}
            className={"ob-opt" + (value === l.v ? " on" : "")}
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
        <span className="lock"><LockIcon /></span>
        <span className="grow">
          You&apos;re learning <span className="jpchip">日本語 · Japanese</span>
        </span>
        <span className="tag">FIXED FOR NOW</span>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onNext}>
          Continue <ArrowIcon />
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

/* ---- Step 3: API Key ---- */
function StepKey({
  provider, onProvider, keyVal, onKey, onFinish, onBack, onSkip,
}: {
  provider: string;
  onProvider: (v: string) => void;
  keyVal: string;
  onKey: (v: string) => void;
  onFinish: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [show, setShow] = useState(false);
  const prov = PROVIDERS.find((p) => p.v === provider) ?? PROVIDERS[0]!;
  const isLocal = provider === "local";

  return (
    <div key="key" className="ob-anim">
      <Progress step="key" />
      <span className="ob-eyebrow">AI key · Optional</span>
      <h1 className="ob-title">Bring your own AI key</h1>
      <p className="ob-sub">
        Paste a key to switch on AI translation and explanations. Fuchine self-hosts
        your key — it&apos;s <span className="em">encrypted at rest</span>, never
        shared, never logged.
      </p>

      <div className="ob-seg" role="tablist" aria-label="Provider">
        {PROVIDERS.map((p) => (
          <button
            key={p.v}
            role="tab"
            aria-selected={provider === p.v}
            className={"ob-seg-b" + (provider === p.v ? " on" : "")}
            onClick={() => onProvider(p.v)}
          >
            {p.l}
          </button>
        ))}
      </div>

      <div className="ob-keyrow">
        <span className="label">{isLocal ? "Endpoint" : "API key"}</span>
        <button className="ob-howto" type="button" onClick={() => {}}>
          How to get a key
        </button>
      </div>
      <div className="ob-key">
        <input
          className="input"
          type={show || isLocal ? "text" : "password"}
          placeholder={prov.ph}
          value={keyVal}
          onChange={(e) => onKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {!isLocal && (
          <button
            className="ob-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide key" : "Show key"}
            type="button"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>

      <div className="ob-secure">
        <span className="lock"><LockIcon /></span>
        <span>Stored encrypted on your account. You can rotate or remove it anytime in Settings.</span>
      </div>

      <div className="ob-note">
        <span className="ni"><InfoIcon /></span>
        <p>
          <span className="em">No key? You&apos;re still set.</span> Dictionary lookups
          and sentence tokenization work fully without one. Turn on AI translation later
          in Settings.
        </p>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onFinish}>
          {keyVal.trim() ? "Save & finish" : "Finish"} <CheckIcon />
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

/* ---- Step 4: Done ---- */
function StepDone({ onEnter }: { onEnter: () => void }) {
  return (
    <div key="done" className="ob-anim ob-done">
      <Progress step="done" />
      <div className="ob-check"><CheckIcon /></div>
      <h1 className="ob-title">You&apos;re all set.</h1>
      <p className="ob-sub">
        Your space is ready. Dive in whenever you are — everything else can be tuned
        later in Settings.
      </p>
      <div className="ob-actions">
        <button className="ob-btn ob-btn-primary" onClick={onEnter}>
          Enter Fuchine <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

/* ---- Main export ---- */
export function OnboardingView({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [lang, setLang] = useState("en");
  const [provider, setProvider] = useState("anthropic");
  const [keyVal, setKeyVal] = useState("");
  const [saving, setSaving] = useState(false);

  const go = (s: Step) => setStep(s);

  const enter = () => router.replace("/");

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const body: Record<string, string> = { explanationLanguage: lang };
    if (keyVal.trim()) {
      body.llmProvider = provider;
      body.apiKey = keyVal;
    }
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } finally {
      setSaving(false);
      go("done");
    }
  };

  const skip = async () => {
    // Mark done even when skipping, so the user isn't looped back.
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explanationLanguage: lang }),
    });
    enter();
  };

  return (
    <div className="ob">
      <div className="ob-watermark" aria-hidden="true">淵</div>

      <header className="ob-top">
        <div className="ob-wordmark">
          <span className="mark">淵</span>
          <span>Fuchine</span>
        </div>
        {step !== "done" && (
          <button className="ob-escape" onClick={skip} title="You can finish setup later in Settings">
            Set up later
          </button>
        )}
      </header>

      <main className="ob-stage">
        <div className="ob-inner">
          {step === "welcome" && (
            <StepWelcome name={name} onNext={() => go("language")} onSkip={skip} />
          )}
          {step === "language" && (
            <StepLanguage
              value={lang}
              onChange={setLang}
              onNext={() => go("key")}
              onBack={() => go("welcome")}
              onSkip={skip}
            />
          )}
          {step === "key" && (
            <StepKey
              provider={provider}
              onProvider={setProvider}
              keyVal={keyVal}
              onKey={setKeyVal}
              onFinish={finish}
              onBack={() => go("language")}
              onSkip={skip}
            />
          )}
          {step === "done" && <StepDone onEnter={enter} />}

          {step !== "done" && (
            <div className="ob-foot">
              <LockIcon />
              You can skip any step and finish setup later in Settings.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
