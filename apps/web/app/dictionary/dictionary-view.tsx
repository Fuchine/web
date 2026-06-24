"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Definition } from "@fuchine/db/types";

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

type Example = {
  videoId: string;
  videoTitle: string | null;
  source: string;
  sourceId: string;
  lineId: string;
  text: string;
  translation: string | null;
  startMs: number;
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

export function DictionaryView() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const reqId = useRef(0);

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
        const data = (await res.json()) as { entries?: Entry[] };
        if (id !== reqId.current) return; // a newer search superseded this one
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
                </div>
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
