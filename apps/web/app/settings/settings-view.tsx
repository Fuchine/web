"use client";

import { useState } from "react";
import { Button } from "@fuchine/ui";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICONS = {
  account: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  learning: (<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="7" height="15" rx="1.4" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="4.5" width="7" height="9.5" rx="1.4" stroke="currentColor" strokeWidth="1.7" /><path d="M13.5 17.5h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>),
  caption: (<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M7 11.5h2.5M7 14.5h4M13.5 11.5H17M13.5 14.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>),
  review: (<svg viewBox="0 0 24 24" fill="none"><path d="M20 11A8 8 0 1 0 21 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M20 4v3.5h-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  spark: (<svg viewBox="0 0 24 24" fill="none"><path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
};

type Theme = "light" | "dark";

function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">
        <span className="grid h-5 w-5 place-items-center">{icon}</span>
        {title}
      </div>
      <div className="rounded-[16px] border border-border bg-surface shadow-[var(--shadow-sm)]">{children}</div>
    </section>
  );
}

function Row({ title, desc, last, children }: { title: string; desc?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[14px] font-[550] text-fg">{title}</p>
        {desc && <p className="mt-0.5 text-[13px] text-muted">{desc}</p>}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-[8px] border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-[6px] px-3 py-1.5 text-[12.5px] font-[500] transition-colors ${
            value === o.v ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

interface SettingsViewProps {
  user: { name: string; email: string; image: string | null };
  settings: {
    learningLanguage: string;
    explanationLanguage: string;
    llmProvider: string | null;
    hasApiKey: boolean;
  };
}

export function SettingsView({ user, settings }: SettingsViewProps) {
  const [theme, setTheme] = useState<Theme>("light");

  // T1.8: persisted settings (provider, BYOK key, explanation language).
  const [provider, setProvider] = useState<string>(settings.llmProvider ?? "minimax");
  const [explanationLanguage, setExplanationLanguage] = useState<string>(settings.explanationLanguage);
  const [hasApiKey, setHasApiKey] = useState<boolean>(settings.hasApiKey);
  const [keyInput, setKeyInput] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        llmProvider?: string | null;
        explanationLanguage?: string;
        hasApiKey?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save settings.");
        return false;
      }
      if (typeof data.hasApiKey === "boolean") setHasApiKey(data.hasApiKey);
      if (data.llmProvider !== undefined && data.llmProvider !== null) setProvider(data.llmProvider);
      if (data.explanationLanguage !== undefined) setExplanationLanguage(data.explanationLanguage);
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const initials = user.name ? user.name.slice(0, 1).toUpperCase() : "?";

  return (
    <div className="px-8 py-9">
      {error && (
        <div className="mb-6 rounded-[12px] border border-border bg-surface px-4 py-3 text-[13px] text-fg">
          {error}
        </div>
      )}
      <div className="mb-9">
        <h1 className="m-0 mb-2 text-[22px] font-[600] -tracking-[0.01em] text-fg">Settings</h1>
        <p className="m-0 text-[14.5px] text-muted">
          Manage your account, learning preferences, and how Fuchine plays back video.
        </p>
      </div>

      {/* Account */}
      <Group icon={ICONS.account} title="Account">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-indigo-2 to-indigo-deep text-[14px] font-[600] text-on-indigo">
              {initials}
            </span>
            <div>
              <p className="text-[14px] font-[550] text-fg">{user.name || "No name"}</p>
              <p className="text-[13px] text-muted">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            Manage
          </Button>
        </div>
        <Row
          title="Interface language"
          desc="Language for menus and the app — not what you study."
        >
          <span className="text-[14px] text-muted">English</span>
        </Row>
      </Group>

      {/* Learning */}
      <Group icon={ICONS.learning} title="Learning">
        <Row title="Studying" desc="The language you're learning from your videos.">
          <span className="text-[14px] text-muted jp">日本語 · Japanese</span>
        </Row>
        <Row
          title="Explanation language"
          desc="Language used for word definitions and line explanations."
        >
          <select
            value={explanationLanguage}
            disabled={saving}
            aria-label="Explanation language"
            onChange={(e) => {
              const next = e.target.value;
              const prev = explanationLanguage;
              setExplanationLanguage(next);
              void save({ explanationLanguage: next }).then((ok) => {
                if (!ok) setExplanationLanguage(prev);
              });
            }}
            className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[14px] text-fg"
          >
            <option value="en">English</option>
            <option value="ja">日本語 · Japanese</option>
          </select>
        </Row>
        <Row title="Furigana" desc="Reading aids above kanji in subtitles and the dictionary." last>
          <Segmented
            value="hover"
            onChange={() => {}}
            options={[{ v: "always", l: "Always" }, { v: "hover", l: "On hover" }, { v: "off", l: "Off" }]}
          />
        </Row>
      </Group>

      {/* Subtitles & playback */}
      <Group icon={ICONS.caption} title="Subtitles & playback">
        <Row title="Dual subtitles" desc="Show the target line and a translation together.">
          <Toggle initialOn={true} />
        </Row>
        <Row title="Subtitle size">
          <Segmented
            value="m"
            onChange={() => {}}
            options={[{ v: "s", l: "Small" }, { v: "m", l: "Medium" }, { v: "l", l: "Large" }]}
          />
        </Row>
        <Row title="Loop the current line by default" desc="Repeat a subtitle line until you move on." last>
          <Toggle initialOn={true} />
        </Row>
      </Group>

      {/* Appearance */}
      <Group icon={ICONS.spark} title="Appearance">
        <Row title="Theme">
          <Segmented
            value={theme}
            onChange={(v) => {
              setTheme(v as Theme);
              document.documentElement.setAttribute("data-theme", v);
            }}
            options={[{ v: "light", l: "Light" }, { v: "dark", l: "Dark" }]}
          />
        </Row>
        <Row title="Reduce motion" desc="Minimize animations and transitions." last>
          <Toggle initialOn={false} />
        </Row>
      </Group>

      {/* AI */}
      <Group icon={(<svg viewBox="0 0 24 24" fill="none"><path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>)} title="AI">
        <Row title="AI provider" desc="Used for line explanations. Configure your own key.">
          <select
            value={provider}
            disabled={saving}
            aria-label="AI provider"
            onChange={(e) => {
              const next = e.target.value;
              const prev = provider;
              setProvider(next);
              void save({ llmProvider: next }).then((ok) => {
                if (!ok) setProvider(prev);
              });
            }}
            className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[14px] text-fg"
          >
            <option value="minimax">MiniMax</option>
            <option value="openai">OpenAI</option>
          </select>
        </Row>
        <Row title="API key" desc="Your key is stored encrypted. Never sent to our servers." last>
          {editingKey ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={keyInput}
                autoFocus
                placeholder="Paste API key"
                aria-label="API key"
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-48 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[14px] text-fg"
              />
              <Button
                size="sm"
                disabled={saving || keyInput.trim().length === 0}
                onClick={async () => {
                  const ok = await save({ apiKey: keyInput });
                  if (ok) {
                    setKeyInput("");
                    setEditingKey(false);
                  }
                }}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeyInput("");
                  setEditingKey(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : hasApiKey ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-[550] text-accent">
                Configured <span aria-hidden="true">✓</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setEditingKey(true)}>
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => void save({ removeKey: true })}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditingKey(true)}>
              Configure key
            </Button>
          )}
        </Row>
      </Group>

      {/* Review */}
      <Group icon={ICONS.review} title="Review">
        <Row title="New cards per day" desc="How many freshly mined cards to introduce daily.">
          <Stepper value={20} />
        </Row>
        <Row title="Maximum reviews per day" desc="Cap on cards due in a single session." last>
          <Stepper value={200} />
        </Row>
      </Group>

      {/* Data */}
      <Group
        icon={(<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v10M8 10.5l4 4 4-4M5 19.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>)}
        title="Data"
      >
        <Row title="Export deck" desc="Download your mined cards as an Anki package.">
          <Button variant="ghost" size="sm">
            Export .apkg
          </Button>
        </Row>
        <Row title="Sign out" desc="You can sign back in any time." last>
          <Button variant="ghost" size="sm">
            Sign out
          </Button>
        </Row>
      </Group>

      <p className="mt-10 text-center text-[12.5px] text-faint">
        Fuchine · v0.4 · <button className="text-link hover:text-link-hover">What&apos;s new</button>
      </p>
    </div>
  );
}

function Toggle({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  return (
    <button
      onClick={() => setOn(!on)}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-10 rounded-full transition-colors ${on ? "bg-accent" : "bg-border-strong"}`}
    >
      <span
        className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Stepper({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0 rounded-[8px] border border-border">
      <button className="grid h-8 w-8 place-items-center text-faint hover:text-fg" aria-label="decrease">−</button>
      <span className="w-12 text-center text-[14px] tabular-nums text-fg">{value}</span>
      <button className="grid h-8 w-8 place-items-center text-faint hover:text-fg" aria-label="increase">+</button>
    </div>
  );
}
