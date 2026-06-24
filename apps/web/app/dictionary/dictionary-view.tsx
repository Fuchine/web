"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Definition } from "@fuchine/db/types";
// type-only import (erased at build — does not bundle lib/dictionary's server deps)
import type { WordExample as Example } from "@/lib/dictionary";
import { conjugate } from "@/lib/conjugate";

/**
 * Map a JMdict frequency rank to a 0–5 tier for the UI dots (pure, no server deps).
 * Mirrors the same function in lib/dictionary.ts; kept here to avoid importing
 * server-only modules (postgres, kuromoji) into a client bundle.
 */
function freqTier(rank: number | null): number {
  if (rank == null) return 0;
  if (rank <= 1500) return 5;
  if (rank <= 5000) return 4;
  if (rank <= 15000) return 3;
  if (rank <= 30000) return 2;
  return 1;
}

type Entry = {
  id: string;
  lemma: string;
  reading: string | null;
  pos: string | null;
  definitions: Definition[];
  frequencyRank: number | null;
};

const FREQ_LABEL = ["", "Rare", "Uncommon", "Common", "Common", "Very common"];
const RECENT_KEY = "fuchine.dict.recent";

function FreqDots({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="freq">
      <span className="dots">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}</span>
      <span className="flabel">{FREQ_LABEL[n]}</span>
    </span>
  );
}

function firstGloss(defs: Definition[]): string {
  return defs[0]?.glosses?.join("; ") ?? "";
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DictionaryView() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const reqId = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const [ttsNote, setTtsNote] = useState<string | null>(null);

  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/dictionary/saved")
      .then((r) => (r.ok ? r.json() : { ids: [] }))
      .then((d: { ids?: string[] }) => { if (active) setSavedIds(new Set(d.ids ?? [])); })
      .catch(() => { /* leave unmarked; saving still works */ });
    return () => { active = false; };
  }, []);

  const toggleSaved = useCallback(async (id: string) => {
    const wasSaved = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(id); else next.add(id);
      return next;
    });
    try {
      const res = await fetch(`/api/dictionary/${id}/saved`, { method: wasSaved ? "DELETE" : "POST" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(id); else next.delete(id);
        return next;
      });
    }
  }, [savedIds]);

  // Load the browser TTS voice list (async in Chrome — also fires voiceschanged).
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  // Speak Japanese text via the browser's TTS. Picks a ja voice explicitly and
  // surfaces a note when none is installed (common on Windows) instead of
  // failing silently. No backend.
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setTtsNote("Audio isn't supported in this browser.");
      return;
    }
    const synth = window.speechSynthesis;
    const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices();
    const ja = voices.find((v) => v.lang?.toLowerCase().startsWith("ja"));
    if (!ja) {
      setTtsNote("No Japanese voice is installed on this device — add one in your OS speech settings to hear pronunciations.");
      return;
    }
    setTtsNote(null);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = ja.lang;
    u.voice = ja;
    synth.cancel();
    synth.speak(u);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const pushRecent = useCallback((term: string) => {
    setRecent((prev) => {
      const next = [term, ...prev.filter((t) => t !== term)].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const select = useCallback(async (entry: Entry) => {
    setSelected(entry);
    setExamples([]);
    setTtsNote(null);
    const res = await fetch(`/api/dictionary/${entry.id}/examples`);
    if (res.ok) {
      const data = (await res.json()) as { examples: Example[] };
      setExamples(data.examples ?? []);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length === 0) {
      setResults([]);
      setSelected(null);
      setExamples([]);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dictionary?q=${encodeURIComponent(term)}`);
        if (id !== reqId.current) return; // a newer search superseded this one
        if (!res.ok) {
          setResults([]);
          setSelected(null);
          return;
        }
        const data = (await res.json()) as { entries?: Entry[] };
        const entries = data.entries ?? [];
        setResults(entries);
        if (entries.length > 0) {
          pushRecent(term);
          void select(entries[0]!);
        } else {
          setSelected(null);
        }
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q, select, pushRecent]);

  const isEmpty = q.trim().length === 0;

  return (
    <main className="dict-main">
      <div className="dict-top">
        <div className="dict-search">
          <input
            className="ds-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a word or reading…"
            aria-label="Search the dictionary"
          />
          {!isEmpty && (
            <button className="ds-clear" onClick={() => setQ("")} aria-label="Clear">×</button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="dict-empty">
          <h2>Look up any Japanese word</h2>
          <p>Search by kanji or kana. Every entry links back to the moments it appears in your videos.</p>
          {recent.length > 0 && (
            <div className="de-recent">
              <span className="de-rl">Recent</span>
              <div className="de-chips">
                {recent.map((w) => (
                  <button key={w} className="de-chip jp" onClick={() => setQ(w)}>{w}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="dict-body">
          <div className="dict-results">
            <div className="dr-head">
              <span><b>{results.length}</b> result{results.length === 1 ? "" : "s"}{searching ? " · …" : ""}</span>
            </div>
            <div className="dr-list">
              {results.map((r) => (
                <button
                  key={r.id}
                  className={"dr-item" + (selected?.id === r.id ? " on" : "")}
                  onClick={() => void select(r)}
                >
                  <div className="dr-main">
                    <span className="dr-word jp">{r.lemma}</span>
                    {r.reading && <span className="dr-reading jp">{r.reading}</span>}
                    {savedIds.has(r.id) && <span className="dr-saved" aria-label="Saved"><BookmarkIcon filled /></span>}
                  </div>
                  <div className="dr-gloss">{firstGloss(r.definitions)}</div>
                  <div className="dr-meta">
                    {r.pos && <span className="dr-pos">{r.pos}</span>}
                    <FreqDots n={freqTier(r.frequencyRank)} />
                  </div>
                </button>
              ))}
              {!searching && results.length === 0 && (
                <div className="dr-none">No results for "{q.trim()}".</div>
              )}
            </div>
          </div>

          {selected && (
            <div className="dict-detail">
              <div className="dd-scroll">
                <div className="dd-head">
                  <div>
                    <div className="dd-word jp">{selected.lemma}</div>
                    {selected.reading && <div className="dd-reading jp">{selected.reading}</div>}
                  </div>
                  <div className="dd-actions">
                    <button
                      className={"dd-save" + (savedIds.has(selected.id) ? " on" : "")}
                      aria-pressed={savedIds.has(selected.id)}
                      onClick={() => void toggleSaved(selected.id)}
                    >
                      <BookmarkIcon filled={savedIds.has(selected.id)} />
                      {savedIds.has(selected.id) ? "Saved" : "Save"}
                    </button>
                    <button
                      className="dd-audio"
                      aria-label="Hear pronunciation"
                      onClick={() => speak(selected.reading ?? selected.lemma)}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                        <path d="M11 5 6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                        <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                {ttsNote && <p className="dd-tts-note">{ttsNote}</p>}
                <div className="dd-tags">
                  {selected.pos && <span className="dd-pos">{selected.pos}</span>}
                  <FreqDots n={freqTier(selected.frequencyRank)} />
                </div>

                <ol className="dd-senses">
                  {selected.definitions.map((s, i) => (
                    <li key={i}>
                      <span className="dd-n">{i + 1}</span>
                      <div>
                        <div className="dd-def">{s.glosses.join("; ")}</div>
                        {s.tags && s.tags.length > 0 && (
                          <div className="dd-stags">{s.tags.map((tg) => <span key={tg} className="dd-stag">{tg}</span>)}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                {(() => {
                  const conj = conjugate(selected.lemma, selected.reading, selected.pos);
                  return conj ? (
                    <div className="dd-section">
                      <div className="dd-sh">Conjugations</div>
                      <div className="dd-conj">
                        {conj.map((c) => (
                          <div key={c.label} className="dd-cj">
                            <span className="cj-k">{c.label}</span>
                            <span className="cj-v jp">{c.word}<span className="cj-r">{c.reading}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {examples.length > 0 && (
                  <div className="dd-section">
                    <div className="dd-sh">From your videos <span className="dd-count">{examples.length}</span></div>
                    <div className="dd-examples">
                      {examples.map((ex) => (
                        <button
                          key={ex.lineId}
                          className="dd-ex"
                          onClick={() => router.push(`/videos/${ex.videoId}?line=${ex.lineId}`)}
                        >
                          <div className="dd-ex-ja jp">{ex.text}</div>
                          {ex.translation && <div className="dd-ex-en">{ex.translation}</div>}
                          <div className="dd-ex-src">
                            <span className="jp">{ex.videoTitle ?? "Video"}</span>
                            <span className="dd-ex-play">▶ Play</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
