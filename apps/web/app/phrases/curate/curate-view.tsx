"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CurateCard, ReviewEmbed, type CurateCardStatus, type ReviewEmbedHandle } from "@fuchine/ui";
import type { UncuratedCard, UncuratedPage } from "@/lib/phrases";
import type { WordEntryData } from "@/lib/cards";
import { curatedNotes, groupByVideo, nextActiveAfter } from "@/lib/curate";
import { usePaginatedList } from "@/lib/use-paginated-list";

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

type CardUi = { status: CurateCardStatus; error: string | null };

const SHORTCUTS: [string, string][] = [
  ["J / K", "next / previous"],
  ["R", "replay clip"],
  ["N", "edit notes"],
  ["D", "done"],
  ["Ctrl+Enter", "done (in notes)"],
];

export function CurateView({
  initial,
  total,
  savedWordIds: initialSaved,
  maxNotes,
}: {
  initial: UncuratedPage;
  total: number;
  savedWordIds: string[];
  maxNotes: number;
}) {
  const [entries, setEntries] = useState<Record<string, WordEntryData>>(initial.wordEntries);
  const fetchPage = useCallback(async (cursor: string | null) => {
    const qs = new URLSearchParams({ limit: "50" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`/api/phrases/curate?${qs}`);
    if (!res.ok) throw new Error(`curate list failed: ${res.status}`);
    const data = (await res.json()) as UncuratedPage;
    setEntries((cur) => ({ ...cur, ...data.wordEntries }));
    return { items: data.items, nextCursor: data.nextCursor };
  }, []);
  const keyOf = useCallback((c: UncuratedCard) => c.cardId, []);
  const { items, loading, hasMore, sentinelRef } = usePaginatedList<UncuratedCard>({
    initial: initial.items,
    initialCursor: initial.nextCursor,
    keyOf,
    fetchPage,
  });

  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ui, setUi] = useState<Record<string, CardUi>>({});
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set(initialSaved));
  const [activeId, setActiveId] = useState<string | null>(null);
  // The card whose clip embed is mounted, and whether that clip is playing.
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const embedRef = useRef<ReviewEmbedHandle | null>(null);
  const notesRefs = useRef(new Map<string, HTMLTextAreaElement>());

  const visible = useMemo(() => items.filter((c) => !removed.has(c.cardId)), [items, removed]);
  const groups = useMemo(() => groupByVideo(visible), [visible]);
  const ordered = useMemo(() => groups.flatMap((g) => g.items.map((c) => c.cardId)), [groups]);
  const active = activeId && ordered.includes(activeId) ? activeId : (ordered[0] ?? null);
  const remaining = Math.max(0, total - removed.size);
  const doneCount = removed.size;

  const setCardUi = (id: string, next: CardUi) => setUi((cur) => ({ ...cur, [id]: next }));

  const removeCard = useCallback((id: string) => {
    setActiveId(nextActiveAfter(ordered, id));
    setRemoved((cur) => new Set(cur).add(id));
    setPlayingId((p) => (p === id ? null : p));
  }, [ordered]);

  const done = useCallback(async (id: string) => {
    const notes = curatedNotes(drafts[id] ?? "");
    if (notes.length > maxNotes) return;
    setCardUi(id, { status: "saving", error: null });
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      // 404: deleted elsewhere — it's out of the queue either way.
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      removeCard(id);
    } catch {
      setCardUi(id, { status: "error", error: "Could not save — try again." });
    }
  }, [drafts, maxNotes, removeCard]);

  const remove = useCallback(async (id: string) => {
    setCardUi(id, { status: "deleting", error: null });
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      removeCard(id);
    } catch {
      setCardUi(id, { status: "error", error: "Could not delete — try again." });
    }
  }, [removeCard]);

  const replay = useCallback((id: string) => {
    setActiveId(id);
    setClipPlaying(true);
    if (playingId === id && embedRef.current) embedRef.current.play();
    else setPlayingId(id);
  }, [playingId]);

  const toggleSaved = useCallback(async (wordId: string, save: boolean) => {
    setSaved((cur) => { const n = new Set(cur); if (save) n.add(wordId); else n.delete(wordId); return n; });
    try {
      const res = await fetch(`/api/dictionary/${wordId}/saved`, { method: save ? "POST" : "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setSaved((cur) => { const n = new Set(cur); if (save) n.delete(wordId); else n.add(wordId); return n; });
    }
  }, []);

  // Keyboard: j/k move, r replays, n edits notes, d marks done. Ignored while
  // typing (the notes field has its own Ctrl/⌘+Enter and Esc).
  const keyState = useRef({ active, ordered, done, replay });
  keyState.current = { active, ordered, done, replay };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { active: cur, ordered: ids, done: markDone, replay: play } = keyState.current;
      const i = cur ? ids.indexOf(cur) : -1;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = ids[Math.min(ids.length - 1, i + 1)];
        if (next) setActiveId(next);
      } else if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = ids[Math.max(0, i - 1)];
        if (prev) setActiveId(prev);
      } else if (key === "r" && cur) {
        e.preventDefault();
        play(cur);
      } else if (key === "n" && cur) {
        e.preventDefault();
        notesRefs.current.get(cur)?.focus();
      } else if (key === "d" && cur) {
        e.preventDefault();
        void markDone(cur);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="rise mx-auto max-w-[860px] px-4 pb-[72px] pt-10 sm:px-10 sm:pt-14">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/phrases" className="text-[13px] font-[550] text-link no-underline hover:text-link-hover">
            ← Phrases
          </Link>
          <h1 className="m-0 mt-2 text-[27px] font-[600] -tracking-[0.02em] text-fg">Curate</h1>
          <p className="m-0 mt-2 text-[14px] text-muted">
            {remaining === 0
              ? "Every mined card is curated."
              : `${remaining} card${remaining === 1 ? "" : "s"} mined without notes`}
            {doneCount > 0 && ` · ${doneCount} done this session`}
          </p>
        </div>
        <ul className="m-0 hidden list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-faint sm:flex" aria-label="Keyboard shortcuts">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k}>
              <kbd className="rounded-[5px] border border-border bg-bg-2 px-1.5 py-[1px] font-[inherit] text-[11px] text-muted">{k}</kbd>{" "}
              {label}
            </li>
          ))}
        </ul>
      </div>

      {visible.length === 0 && !hasMore ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center">
          <p className="m-0 text-[15px] font-[550] text-fg">Nothing to curate</p>
          <p className="m-0 mt-2 text-[14px] text-muted">
            Mine sentences while you watch — press <kbd className="rounded-[5px] border border-border bg-bg-2 px-1.5 text-[12px]">M</kbd> in
            the player — and add notes here later, without pausing.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/library" className="text-[14px] font-[550] text-link no-underline hover:text-link-hover">Go to library</Link>
            <Link href="/review" className="text-[14px] font-[550] text-link no-underline hover:text-link-hover">Start review</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.videoId} aria-label={g.items[0]?.videoTitle ?? "Video"}>
              <h2 className="m-0 mb-3 flex items-baseline justify-between gap-3 text-[14px] font-[600] text-fg">
                <Link href={`/videos/${g.videoId}`} className="truncate text-fg no-underline hover:text-link">
                  {g.items[0]?.videoTitle ?? "Video"}
                </Link>
                <span className="shrink-0 text-[12.5px] font-[500] text-faint">
                  {g.items.length} card{g.items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="space-y-3">
                {g.items.map((c) => {
                  const state = ui[c.cardId] ?? { status: "idle" as const, error: null };
                  const mounted = playingId === c.cardId;
                  return (
                    <CurateCard
                      key={c.cardId}
                      sentence={{ text: c.textOriginal, translation: c.textTranslation }}
                      tokens={c.tokens}
                      wordEntries={entries}
                      explanation={c.explanation}
                      time={fmtMs(c.tStartMs)}
                      notes={drafts[c.cardId] ?? ""}
                      onNotesChange={(v) => setDrafts((cur) => ({ ...cur, [c.cardId]: v }))}
                      maxNotes={maxNotes}
                      active={active === c.cardId}
                      onActivate={() => setActiveId(c.cardId)}
                      status={state.status}
                      error={state.error}
                      playing={mounted && clipPlaying}
                      clip={
                        mounted ? (
                          <ReviewEmbed
                            ref={embedRef}
                            videoId={c.sourceId}
                            startMs={c.tStartMs}
                            endMs={c.tEndMs}
                            onEnded={() => setClipPlaying(false)}
                            autoplay
                          />
                        ) : undefined
                      }
                      onReplay={() => replay(c.cardId)}
                      onDelete={() => void remove(c.cardId)}
                      onDone={() => void done(c.cardId)}
                      savedWordIds={saved}
                      onSaveWord={(id, s) => void toggleSaved(id, s)}
                      notesRef={(el) => {
                        if (el) notesRefs.current.set(c.cardId, el);
                        else notesRefs.current.delete(c.cardId);
                      }}
                    />
                  );
                })}
              </div>
            </section>
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="py-6 text-center text-[13px] text-faint">
              {loading ? "Loading more…" : " "}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
