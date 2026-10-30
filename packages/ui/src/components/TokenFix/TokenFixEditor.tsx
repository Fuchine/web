"use client";

import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  buildOverrideEdit,
  editBlock,
  identitySpans,
  isHiraganaReading,
  mergeTokens,
  splitToken,
  toHiragana,
  type TokenSpan,
} from "@fuchine/core";
import type { Token } from "@fuchine/db";
import { cn } from "../../lib/cn";

/** A token as the UI holds it (subtitle_lines.tokens shape, romaji optional). */
export type FixToken = {
  surface: string;
  lemma?: string;
  reading: string | null;
  romaji?: string | null;
  pos?: string | null;
  wordEntryId: string | null;
};

/**
 * One corrected token sent to PUT /api/lines/:id/tokens. `wordEntryId`
 * omitted = let the server match it from the dictionary; null = not a
 * dictionary word (a name).
 */
export type TokenFixInput = {
  surface: string;
  lemma: string;
  reading: string | null;
  pos: string | null;
  wordEntryId?: string | null;
};

export type TokenFixOverride = { startIdx: number; endIdx: number; tokens: TokenFixInput[] };

/** A dictionary search hit offered by the "Dictionary entry" picker. */
export type FixEntryHit = { id: string; lemma: string; reading: string | null; gloss: string };

export type TokenFixEditorProps = {
  /** The line's tokens as the user sees them (corrections applied). */
  tokens: FixToken[];
  /** Origin spans parallel to `tokens`; absent = the line is uncorrected. */
  spans?: TokenSpan[] | null;
  /** The token the popup was opened on. */
  index: number;
  onSave: (override: TokenFixOverride) => Promise<void> | void;
  /** Reset the correction block the token belongs to. */
  onReset: (span: { startIdx: number; endIdx: number }) => Promise<void> | void;
  onSearch?: (q: string) => Promise<FixEntryHit[]>;
  onCancel: () => void;
  /** Server error from the last save/reset. */
  error?: string | null;
  busy?: boolean;
  className?: string;
};

type EntryChoice =
  | { kind: "keep"; id: string }
  | { kind: "auto" }
  | { kind: "pick"; id: string; label: string }
  | { kind: "none" };

type Draft = { token: Token; entry: EntryChoice };

const NAME_POS = "固有名詞"; // IPADIC's proper-noun tag

function asToken(t: FixToken): Token {
  return {
    surface: t.surface,
    lemma: t.lemma ?? t.surface,
    reading: t.reading ?? null,
    romaji: t.romaji ?? null,
    pos: t.pos ?? "",
    wordEntryId: t.wordEntryId ?? null,
  };
}

const initialEntry = (t: Token): EntryChoice => (t.wordEntryId ? { kind: "keep", id: t.wordEntryId } : { kind: "auto" });

function toInput(t: Token, entry?: EntryChoice): TokenFixInput {
  const base: TokenFixInput = { surface: t.surface, lemma: t.lemma || t.surface, reading: t.reading || null, pos: t.pos || null };
  if (!entry) return { ...base, wordEntryId: t.wordEntryId };
  if (entry.kind === "keep" || entry.kind === "pick") return { ...base, wordEntryId: entry.id };
  if (entry.kind === "none") return { ...base, pos: NAME_POS, wordEntryId: null };
  return base; // auto: the server resolves it
}

const btn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] font-[550] " +
  "cursor-pointer transition-[background-color,border-color,color] duration-150 disabled:cursor-default disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";
const ghost = "border-border-strong bg-surface text-fg hover:border-faint";
const primary = "border-accent bg-accent text-on-accent hover:bg-accent-hover";
const label = "block text-[11px] font-[600] uppercase tracking-[0.04em] text-faint";

/**
 * The "Fix" editor of the dictionary popup (T3.7): adjust the token's
 * boundaries (merge with a neighbor, split at a character), edit its reading,
 * pick its dictionary entry or mark it as a name. Saves a per-user correction;
 * the line text itself can't change. Escape cancels.
 */
export function TokenFixEditor({
  tokens,
  spans: spansProp,
  index,
  onSave,
  onReset,
  onSearch,
  onCancel,
  error,
  busy = false,
  className,
}: TokenFixEditorProps) {
  const ids = useId();
  const all = tokens.map(asToken);
  const spans = spansProp && spansProp.length === tokens.length ? spansProp : identitySpans(tokens.length);
  const [range, setRange] = useState<[number, number]>([index, index]);
  const [draft, setDraft] = useState<Draft[]>(() => (all[index] ? [{ token: all[index]!, entry: initialEntry(all[index]!) }] : []));
  const [focus, setFocus] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FixEntryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, []);

  const current = draft[Math.min(focus, draft.length - 1)];
  const [a, b] = range;
  const corrected = spans[index]?.corrected ?? false;
  const readingValue = current?.token.reading ?? "";
  const readingInvalid = readingValue !== "" && !isHiraganaReading(toHiragana(readingValue));
  const chars = current ? [...current.token.surface] : [];

  const patchCurrent = (patch: (d: Draft) => Draft) =>
    setDraft((ds) => ds.map((d, i) => (i === Math.min(focus, ds.length - 1) ? patch(d) : d)));

  const mergeNext = () => {
    if (b + 1 >= all.length) return;
    setDraft((ds) => {
      const last = ds[ds.length - 1]!;
      return [...ds.slice(0, -1), { token: mergeTokens(last.token, all[b + 1]!), entry: { kind: "auto" } }];
    });
    setFocus(draft.length - 1);
    setRange([a, b + 1]);
  };
  const mergePrev = () => {
    if (a === 0) return;
    setDraft((ds) => [{ token: mergeTokens(all[a - 1]!, ds[0]!.token), entry: { kind: "auto" } }, ...ds.slice(1)]);
    setFocus(0);
    setRange([a - 1, b]);
  };
  const splitAt = (at: number) => {
    const f = Math.min(focus, draft.length - 1);
    const [left, right] = splitToken(draft[f]!.token, at);
    setDraft((ds) => [
      ...ds.slice(0, f),
      { token: left, entry: { kind: "auto" } },
      { token: right, entry: { kind: "auto" } },
      ...ds.slice(f + 1),
    ]);
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!onSearch || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      setHits(await onSearch(query.trim()));
    } catch {
      setSearchError("Search failed — try again.");
    } finally {
      setSearching(false);
    }
  };

  const save = () => {
    if (readingInvalid || busy || draft.length === 0) return;
    const edit = buildOverrideEdit(all, spans, a, b, draft.map((d) => ({
      ...d.token,
      reading: d.token.reading ? toHiragana(d.token.reading) : null,
    })));
    // The draft sits after the block's untouched leading tokens (carried with
    // their current entries); its tokens carry the user's entry choices.
    const [lo] = editBlock(spans, a, b);
    const start = a - lo;
    void onSave({
      startIdx: edit.startIdx,
      endIdx: edit.endIdx,
      tokens: edit.tokens.map((t, i) =>
        i >= start && i < start + draft.length ? toInput(t, draft[i - start]!.entry) : toInput(t)),
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation(); // page shortcuts (j/k/d…) must not fire while editing
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  if (!current) return null;
  const choice = current.entry;

  return (
    <div
      ref={rootRef}
      className={cn("token-fix flex flex-col gap-3 text-fg", className)}
      role="group"
      aria-label="Fix this word"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-[650]">Fix this word</div>
        {corrected && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-[600] text-link">Corrected by you</span>
        )}
      </div>

      {/* Boundaries */}
      <div>
        <div className={label} id={`${ids}-bounds`}>Boundaries</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-labelledby={`${ids}-bounds`}>
          {draft.map((d, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                "jp rounded-[6px] border px-2 py-0.5 text-[17px] cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                i === Math.min(focus, draft.length - 1) ? "border-accent bg-accent-soft" : "border-border bg-surface",
              )}
              aria-pressed={i === Math.min(focus, draft.length - 1)}
              aria-label={`Edit ${d.token.surface}`}
              onClick={() => setFocus(i)}
              lang="ja"
            >
              {d.token.surface}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={cn(btn, ghost)} onClick={mergePrev} disabled={a === 0}>
            Merge with previous
          </button>
          <button type="button" className={cn(btn, ghost)} onClick={mergeNext} disabled={b + 1 >= all.length}>
            Merge with next
          </button>
        </div>
        {chars.length > 1 && (
          <div className="mt-2">
            <div className="text-[11.5px] text-muted">Split after:</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {chars.slice(0, -1).map((ch, i) => (
                <button
                  key={i}
                  type="button"
                  className={cn(btn, ghost, "jp h-7 px-2")}
                  onClick={() => splitAt(i + 1)}
                  aria-label={`Split after ${chars.slice(0, i + 1).join("")}`}
                  lang="ja"
                >
                  {chars.slice(0, i + 1).join("")}|
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reading */}
      <label className="block">
        <span className={label}>Reading (hiragana)</span>
        <input
          type="text"
          lang="ja"
          value={readingValue}
          onChange={(e) => patchCurrent((d) => ({ ...d, token: { ...d.token, reading: e.target.value } }))}
          className={cn(
            "jp mt-1 block h-9 w-full rounded-[8px] border bg-field px-2.5 text-[15px] text-fg",
            "focus:outline-none focus:ring-2 focus:ring-accent-ring",
            readingInvalid ? "border-error" : "border-border",
          )}
          aria-invalid={readingInvalid || undefined}
          aria-describedby={readingInvalid ? `${ids}-reading-err` : undefined}
          placeholder="e.g. じゅっぷん"
        />
        {readingInvalid && (
          <span id={`${ids}-reading-err`} className="mt-1 block text-[11.5px] text-error">Use hiragana only.</span>
        )}
      </label>

      {/* Dictionary entry */}
      <fieldset className="m-0 border-0 p-0">
        <legend className={label}>Dictionary entry</legend>
        <div className="mt-1.5 flex flex-col gap-1 text-[13px]">
          {current.token.wordEntryId && (
            <Radio
              name={`${ids}-entry`}
              checked={choice.kind === "keep"}
              onChange={() => patchCurrent((d) => ({ ...d, entry: { kind: "keep", id: d.token.wordEntryId! } }))}
            >
              Keep the current entry
            </Radio>
          )}
          <Radio
            name={`${ids}-entry`}
            checked={choice.kind === "auto"}
            onChange={() => patchCurrent((d) => ({ ...d, entry: { kind: "auto" } }))}
          >
            Match automatically
          </Radio>
          {choice.kind === "pick" && (
            <Radio name={`${ids}-entry`} checked onChange={() => {}}>
              <span className="jp" lang="ja">{choice.label}</span>
            </Radio>
          )}
          <Radio
            name={`${ids}-entry`}
            checked={choice.kind === "none"}
            onChange={() => patchCurrent((d) => ({ ...d, entry: { kind: "none" } }))}
          >
            Not a dictionary word (name)
          </Radio>
        </div>
        {onSearch && (
          <form className="mt-2 flex gap-1.5" onSubmit={search} role="search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the dictionary"
              aria-label="Search the dictionary"
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-border bg-field px-2.5 text-[13px] text-fg focus:outline-none focus:ring-2 focus:ring-accent-ring"
            />
            <button type="submit" className={cn(btn, ghost)} disabled={searching || !query.trim()}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
        )}
        {searchError && <p className="m-0 mt-1 text-[11.5px] text-error" role="alert">{searchError}</p>}
        {hits && (
          <ul className="m-0 mt-1.5 max-h-36 list-none overflow-y-auto p-0" aria-label="Dictionary results">
            {hits.length === 0 && <li className="text-[12px] text-muted">No matches.</li>}
            {hits.map((h) => {
              const text = h.reading && h.reading !== h.lemma ? `${h.lemma}【${h.reading}】` : h.lemma;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-1.5 py-1 text-left text-[12.5px] text-fg hover:bg-accent-soft",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                      choice.kind === "pick" && choice.id === h.id && "bg-accent-soft",
                    )}
                    onClick={() => patchCurrent((d) => ({ ...d, entry: { kind: "pick", id: h.id, label: text } }))}
                  >
                    <span className="jp" lang="ja">{text}</span>
                    {h.gloss && <span className="text-muted"> — {h.gloss}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {error && <p className="m-0 text-[12px] text-error" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {corrected && (
          <button
            type="button"
            className={cn(btn, ghost)}
            disabled={busy}
            onClick={() => void onReset({ startIdx: spans[index]!.start, endIdx: spans[index]!.end })}
          >
            Reset
          </button>
        )}
        <button type="button" className={cn(btn, ghost, "ml-auto")} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={cn(btn, primary)} onClick={save} disabled={busy || readingInvalid}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Radio({
  name, checked, onChange, children,
}: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-[var(--accent)]" />
      <span>{children}</span>
    </label>
  );
}
