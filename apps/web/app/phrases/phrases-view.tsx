"use client";

import { useState, useRef, useEffect, useCallback, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import type { PhraseRow } from "@/lib/phrases";
import { usePaginatedList } from "@/lib/use-paginated-list";

/* ---- icons ---- */
function ISearch(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5" /></svg>;
}
function ISort(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M7 5v14M4 16l3 3 3-3M14 7h6M14 12h4M14 17h2" /></svg>;
}
function ICheck(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12.5 10 17.5 19 7" /></svg>;
}
function IReview(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 11A8 8 0 1 0 18 16.5M20 5v6h-6" /></svg>;
}
function IPlay(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7z" /></svg>;
}
function IYoutube(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="3.5" /><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" /></svg>;
}
function IMore(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>;
}
function IRefresh(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.5 9A9 9 0 0 0 5.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 0 1 3.5 15" /></svg>;
}
function IClose(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

/* ---- types & helpers ---- */
export type PhraseStatus = "new" | "learning" | "due" | "known";

export type Phrase = PhraseRow & { status: PhraseStatus };

function deriveStatus(state: number, due: Date): PhraseStatus {
  const now = new Date();
  if (state === 0) return "new";
  if (state === 1 || state === 3) return "learning";
  if (state === 2) return due <= now ? "due" : "known";
  return "learning";
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "1 week ago";
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

const STATUS_META: Record<PhraseStatus, { label: string; dot: string; text: string; bg: string }> = {
  new:      { label: "New",      dot: "bg-link",  text: "text-link",  bg: "bg-accent-soft-2" },
  learning: { label: "Learning", dot: "bg-[oklch(0.62_0.10_70)]", text: "text-[oklch(0.50_0.10_70)]", bg: "bg-[oklch(0.62_0.10_70/0.13)]" },
  due:      { label: "Due",      dot: "bg-error",  text: "text-error", bg: "bg-[color-mix(in_oklch,var(--error)_11%,var(--surface))]" },
  known:    { label: "Known",    dot: "bg-ok",     text: "text-ok",   bg: "bg-ok-soft" },
};

const FILTERS: { v: "all" | PhraseStatus; l: string }[] = [
  { v: "all", l: "All" },
  { v: "due", l: "Due" },
  { v: "learning", l: "Learning" },
  { v: "new", l: "New" },
  { v: "known", l: "Known" },
];

const SORTS = [
  { v: "recent", l: "Recently mined" },
  { v: "oldest", l: "Oldest first" },
  { v: "status", l: "By status" },
  { v: "az",     l: "Alphabetical" },
] as const;

type SortKey = (typeof SORTS)[number]["v"];

const STATUS_ORDER: Record<PhraseStatus, number> = { due: 0, learning: 1, new: 2, known: 3 };

/* ---- Popover ---- */
function Popover({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[200px] animate-[ph-pop-in_0.14s_var(--ease)] rounded-[var(--radius-lg)] border border-border bg-surface p-[6px] shadow-[var(--shadow-lg)]">
      {children}
    </div>
  );
}

function MenuItem({
  onClick, icon: Icon, label, danger = false,
}: {
  onClick: () => void;
  icon: React.ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-[10px] rounded-[8px] px-[11px] py-[9px] text-left text-[13px] font-[500] transition-colors " +
        (danger
          ? "text-error hover:bg-[color-mix(in_oklch,var(--error)_8%,var(--surface))] [&>svg]:text-error"
          : "text-fg hover:bg-bg-2 [&>svg]:text-faint hover:[&>svg]:text-fg")
      }
    >
      <Icon className="h-4 w-4 flex-none" />
      <span className="flex-1">{label}</span>
    </button>
  );
}

function MenuSep() {
  return <div className="mx-[6px] my-[5px] h-px bg-border" />;
}

/* ---- Badge ---- */
function Badge({ status }: { status: PhraseStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`mt-[3px] inline-flex min-w-[86px] flex-none items-center gap-[6px] rounded-full py-[5px] pl-[9px] pr-[11px] text-[11.5px] font-[600] tracking-[0.01em] ${m.text} ${m.bg}`}>
      <i className={`h-[7px] w-[7px] flex-none rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

/* ---- Phrase card ---- */
function PhraseCard({
  phrase, onRemove,
}: {
  phrase: Phrase;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const videoHref = `/videos/${phrase.videoId}`;
  const timestamp = fmtMs(phrase.tStartMs);

  return (
    <div className="flex items-start gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-[18px_20px] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[var(--shadow)]">
      {/* Status badge */}
      <Badge status={phrase.status} />

      {/* Body */}
      <div className="min-w-0 flex-1">
        <button
          onClick={() => router.push(videoHref)}
          className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left font-['Inter','Noto_Sans_JP',sans-serif] text-[20px] font-[500] leading-[1.7] tracking-[0.01em] text-fg transition-colors hover:text-link"
        >
          {phrase.textOriginal}
        </button>
        {phrase.textTranslation && (
          <p className="mt-[6px] text-[13.5px] leading-[1.45] text-muted">
            {phrase.textTranslation}
          </p>
        )}
        <div className="mt-[11px] flex items-center gap-[10px]">
          <button
            onClick={() => router.push(videoHref)}
            className="inline-flex items-center gap-[7px] border-0 bg-transparent p-0 text-[12px] text-faint transition-colors hover:text-link cursor-pointer"
          >
            <IYoutube className="h-[15px] w-[15px]" />
            <span className="font-['Inter','Noto_Sans_JP',sans-serif]">{phrase.videoTitle}</span>
            <span>· {timestamp}</span>
          </button>
          <span className="h-[3px] w-[3px] rounded-full bg-border-strong" />
          <span className="text-[12px] text-faint">Mined {timeAgo(phrase.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-none gap-[3px]">
        <button
          onClick={() => router.push(videoHref)}
          title="Open in video"
          className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent text-faint transition-[background,color] hover:bg-bg-2 hover:text-fg"
        >
          <IPlay className="h-[18px] w-[18px]" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title="More"
            className={
              "grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[9px] border-0 transition-[background,color] " +
              (menuOpen ? "bg-accent-soft text-link" : "bg-transparent text-faint hover:bg-bg-2 hover:text-fg")
            }
          >
            <IMore className="h-[18px] w-[18px]" />
          </button>
          <Popover open={menuOpen}>
            <MenuItem icon={IReview} label="Review now" onClick={() => { setMenuOpen(false); router.push("/review"); }} />
            <MenuItem icon={IYoutube} label="Open in video" onClick={() => { setMenuOpen(false); router.push(videoHref); }} />
            <MenuItem icon={IRefresh} label="Reset progress" onClick={() => setMenuOpen(false)} />
            <MenuSep />
            <MenuItem icon={IClose} label="Remove phrase" danger onClick={() => { setMenuOpen(false); onRemove(phrase.cardId); }} />
          </Popover>
        </div>
      </div>
    </div>
  );
}

/* ---- Empty state ---- */
function Empty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center px-5 pb-[60px] pt-[60px] text-center text-muted">
      <span className="mb-[14px] inline-grid h-[46px] w-[46px] place-items-center rounded-[13px] border border-border bg-bg-2 text-faint">
        <ISearch className="h-[22px] w-[22px]" />
      </span>
      <h3 className="m-0 mb-[6px] text-[16px] font-[600] text-fg">No phrases here</h3>
      <p className="m-0 text-[13.5px]">
        {filtered
          ? "Try a different search or filter."
          : "Mine sentences while watching to build this list."}
      </p>
    </div>
  );
}

/* ---- Toast ---- */
function Toast({ msg, undo, onDismiss }: { msg: string; undo?: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-[26px] left-1/2 z-[90] inline-flex -translate-x-1/2 animate-[ph-toast-in_0.22s_var(--ease)] items-center gap-[10px] rounded-full bg-fg px-[18px] py-3 text-[13.5px] font-[550] text-surface shadow-[var(--shadow-lg)]">
      <ICheck className="h-4 w-4" />
      {msg}
      {undo && (
        <button
          onClick={() => { undo(); onDismiss(); }}
          className="cursor-pointer border-0 bg-transparent pl-1 text-[13px] font-[700] text-[#9db4ff] hover:underline"
        >
          Undo
        </button>
      )}
    </div>
  );
}

/* ---- Main view ---- */
export function PhrasesView({
  phrases: initialPhrases,
  nextCursor = null,
  reviewDue,
}: {
  phrases: PhraseRow[];
  nextCursor?: string | null;
  reviewDue: number;
}) {
  const router = useRouter();

  // Infinite scroll: the server seeds the first page; the sentinel fetches more
  // on demand. Fetched rows arrive as JSON, so revive the Date fields the RSC
  // payload gives natively. Search/sort/filter below run over loaded pages.
  const fetchPhrases = useCallback(async (cursor: string) => {
    const r = await fetch(`/api/phrases?cursor=${encodeURIComponent(cursor)}`);
    if (!r.ok) throw new Error(`phrases ${r.status}`);
    const data = (await r.json()) as { phrases: PhraseRow[]; nextCursor: string | null };
    const items = data.phrases.map((p) => ({
      ...p,
      due: new Date(p.due),
      createdAt: new Date(p.createdAt),
    }));
    return { items, nextCursor: data.nextCursor };
  }, []);
  const keyOfPhrase = useCallback((p: PhraseRow) => p.cardId, []);
  const { items, loading: loadingMore, hasMore, sentinelRef } = usePaginatedList<PhraseRow>({
    initial: initialPhrases,
    initialCursor: nextCursor,
    keyOf: keyOfPhrase,
    fetchPage: fetchPhrases,
  });

  const phrases: Phrase[] = items.map((p) => ({
    ...p,
    status: deriveStatus(p.state, p.due),
  }));

  const [filter, setFilter] = useState<"all" | PhraseStatus>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const close = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sortOpen]);

  const onRemove = useCallback((id: string) => {
    setRemoved((s) => new Set(s).add(id));
    setToast({
      msg: "Phrase removed",
      undo: () => setRemoved((s) => { const n = new Set(s); n.delete(id); return n; }),
    });
  }, []);

  const q = query.trim().toLowerCase();

  const counts = phrases.reduce<Record<string, number>>((acc, p) => {
    if (!removed.has(p.cardId)) acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = phrases.filter((p) => !removed.has(p.cardId)).length;

  const list = phrases
    .filter((p) => {
      if (removed.has(p.cardId)) return false;
      if (filter !== "all" && p.status !== filter) return false;
      if (q) {
        const hay = `${p.textOriginal} ${p.textTranslation ?? ""} ${p.videoTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "recent") return b.createdAt.getTime() - a.createdAt.getTime();
      if (sort === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
      if (sort === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (sort === "az") return a.textOriginal.localeCompare(b.textOriginal, "ja");
      return 0;
    });

  const sortLabel = SORTS.find((s) => s.v === sort)?.l ?? "Sort";
  const dueCount = counts["due"] ?? 0;

  return (
    <div className="rise mx-auto max-w-[860px] px-10 pb-[72px] pt-14">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="m-0 text-[27px] font-[600] -tracking-[0.02em] text-fg">Phrases</h1>
          <p className="m-0 mt-2 text-[14px] text-muted">
            {total} sentence{total !== 1 ? "s" : ""} mined from your videos
            {dueCount > 0 && ` · ${dueCount} due today`}
          </p>
        </div>
        {reviewDue > 0 && (
          <button
            onClick={() => router.push("/review")}
            className="rise-2 inline-flex flex-none items-center gap-[9px] rounded-[var(--radius)] border-0 bg-accent px-[22px] py-[12px] text-[14.5px] font-[550] text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-press cursor-pointer"
          >
            <IReview className="h-[17px] w-[17px]" /> Review due
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="rise-2 mb-[18px] flex flex-wrap items-center justify-between gap-4">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-[7px]">
          {FILTERS.map((f) => {
            const n = f.v === "all" ? total : (counts[f.v] ?? 0);
            const on = filter === f.v;
            return (
              <button
                key={f.v}
                onClick={() => setFilter(f.v)}
                className={
                  "inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-full border px-[13px] text-[13px] font-[550] transition-[border-color,color,background] " +
                  (on
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg")
                }
              >
                {f.l}
                <span className={`text-[11.5px] font-[600] tabular-nums ${on ? "text-on-accent/80" : "text-faint"}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tools */}
        <div className="flex items-center gap-[9px]">
          {/* Search */}
          <div className="flex h-[36px] w-[200px] items-center gap-2 rounded-[9px] border border-border-strong bg-field px-3 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3.5px_var(--accent-ring)]">
            <ISearch className="h-4 w-4 flex-none text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search phrases…"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-faint"
            />
          </div>

          {/* Sort */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setSortOpen((o) => !o)}
              className={
                "inline-flex h-[36px] cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-[9px] border px-[13px] text-[13px] font-[550] transition-[border-color,color] " +
                (sortOpen
                  ? "border-accent text-link"
                  : "border-border-strong bg-surface text-muted hover:border-faint hover:text-fg")
              }
            >
              <ISort className="h-[15px] w-[15px]" />
              {sortLabel}
            </button>
            <Popover open={sortOpen}>
              {SORTS.map((s) => (
                <button
                  key={s.v}
                  onClick={() => { setSort(s.v); setSortOpen(false); }}
                  className="flex w-full items-center gap-[10px] rounded-[8px] px-[11px] py-[9px] text-left text-[13px] font-[500] text-fg transition-colors hover:bg-bg-2"
                >
                  <ISort className="h-4 w-4 flex-none text-faint" />
                  <span className="flex-1">{s.l}</span>
                  {sort === s.v && <ICheck className="h-[15px] w-[15px] text-link" />}
                </button>
              ))}
            </Popover>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rise-3 flex flex-col gap-[10px]">
        {list.length === 0
          ? <Empty filtered={filter !== "all" || q.length > 0} />
          : list.map((p) => (
              <PhraseCard key={p.cardId} phrase={p} onRemove={onRemove} />
            ))
        }
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-6 text-[13px] text-faint">
            {loadingMore ? "Loading more…" : ""}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          msg={toast.msg}
          undo={toast.undo}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
