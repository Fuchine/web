"use client";

import { useState, useRef, useEffect, useMemo, useCallback, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { VideoCard } from "@fuchine/ui";
import { AppLayout } from "@/components/AppLayout";

export type LibraryVideo = {
  id: string;
  title: string;
  channel: string | null;
  source: string;
  sourceId: string;
  durationS: number | null;
  status: "pending" | "processing" | "done" | "failed";
  level: number | null;
  comprehension: number | null;
  embeddable?: boolean | null; // false = owner blocked embedded playback
  category?: string | null;
};

export type LibraryStats = {
  watchTimeHours: number; // real tracked watch time (user_daily_stats)
  videoCount: number;
  wordsLearned: number;
  dayStreak: number;
};

function youtubeThumbnail(sourceId: string) {
  return `https://img.youtube.com/vi/${sourceId}/mqdefault.jpg`;
}

function dur(s: number | null): string | undefined {
  if (!s || s <= 0) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function hrs(s: number): string {
  const h = s / 3600;
  return h >= 10 ? h.toFixed(1) : h.toFixed(1);
}

const STATUS: Record<string, { variant: "neutral" | "warning" | "error"; label: string } | null> = {
  done: null,
  pending: { variant: "neutral", label: "Queued" },
  processing: { variant: "warning", label: "Processing" },
  failed: { variant: "error", label: "Failed" },
};

const CATEGORIES = [
  "All", "Gaming", "Music", "Variety", "VTuber", "Vlog",
  "How-to/DIY", "Education", "Anime/Manga", "Movies/Dramas",
  "Food", "Beauty/Fashion", "News",
];

const SORT_OPTIONS = [
  { key: "newest" as const, label: "Recently added" },
  { key: "comp" as const, label: "Most comprehensible" },
  { key: "short" as const, label: "Shortest first" },
  { key: "level" as const, label: "Level: low to high" },
];

type SortKey = (typeof SORT_OPTIONS)[number]["key"];

function SSearch(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5" /></svg>);
}
function SFilter(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M4 6.5h16" /><path d="M7 12h10" /><path d="M10 17.5h4" /></svg>);
}
function SSort(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M7 5v14" /><path d="M4 16l3 3 3-3" /><path d="M14 7h6M14 12h4M14 17h2" /></svg>);
}
function SCheck(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12.5L10 17.5 19 7" /></svg>);
}
function SPlus(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M12 5v14M5 12h14" /></svg>);
}
function SClose(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>);
}
function SYoutube(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}><rect x="2.5" y="5.5" width="19" height="13" rx="3.5" /><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" /></svg>);
}
function SSpark(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z" /></svg>);
}
function SBookmark(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z" /></svg>);
}
function SBookmarkFill(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z" /></svg>);
}
function SEyeOff(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M4 4l16 16" /><path d="M9.9 5.4A8.6 8.6 0 0 1 12 5.2c5 0 8.5 4.4 8.5 6.8a10 10 0 0 1-2.2 3" /><path d="M6.4 7.1C4.2 8.4 2.5 10.6 2.5 12c0 2.4 3.5 6.8 9.5 6.8a9.3 9.3 0 0 0 3.6-0.7" /><path d="M9.8 9.9a3 3 0 0 0 4.1 4.1" /></svg>);
}
function SFolderPlus(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.6l2 2.4H19a1.5 1.5 0 0 1 1.5 1.5v7.6a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M12 11.6v4.2M9.9 13.7h4.2" /></svg>);
}
function SFlag(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M6 4v16" /><path d="M6 5h11l-2 3.2L17 11H6" /></svg>);
}
function SDownload(props: SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M12 4v10" /><path d="M8 10.5l4 4 4-4" /><path d="M5 19.5h14" /></svg>);
}

function StatBar({ stats }: { stats: LibraryStats }) {
  return (
    <div className="mt-[9px] flex items-center gap-3 text-[12.5px] text-faint">
      <span className="inline-flex items-baseline gap-[5px] whitespace-nowrap">
        <b className="font-[600] tabular-nums text-muted">{stats.watchTimeHours.toFixed(1)}</b> hours watched
      </span>
      <span className="h-[3px] w-[3px] rounded-full bg-border-strong" />
      <span className="inline-flex items-baseline gap-[5px] whitespace-nowrap">
        <b className="font-[600] tabular-nums text-muted">{stats.wordsLearned}</b> words learned
      </span>
      <span className="h-[3px] w-[3px] rounded-full bg-border-strong" />
      <span className="inline-flex items-baseline gap-[5px] whitespace-nowrap">
        <b className="font-[600] tabular-nums text-muted">{stats.dayStreak}</b> day streak
      </span>
    </div>
  );
}

function TopBar({
  stats, query, setQuery, sort, setSort, mine, setMine, onAdd,
  albums, albumFilter, setAlbumFilter,
}: {
  stats: LibraryStats;
  query: string;
  setQuery: (q: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  mine: boolean;
  setMine: (m: boolean) => void;
  onAdd: () => void;
  albums: LibraryAlbum[];
  albumFilter: string | null;
  setAlbumFilter: (id: string | null) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  return (
    <div className="flex flex-wrap items-start justify-between gap-[18px_24px] px-10 pb-4 pt-[22px]">
      <div className="min-w-0 flex-[0_0_auto]">
        <h1 className="m-0 text-[25px] font-[600] -tracking-[0.02em] leading-[1.1]">Videos</h1>
        <StatBar stats={stats} />
      </div>
      <div className="flex min-w-[330px] flex-1 flex-wrap items-center justify-end gap-[10px]">
        <div className="relative flex w-[248px] items-center max-lg:w-[200px]">
          <SSearch className="pointer-events-none absolute left-3 h-[17px] w-[17px] text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos" aria-label="Search videos"
            className="h-10 w-full rounded-[var(--radius)] border border-border-strong bg-field pl-[37px] pr-3 text-[13.5px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]" />
        </div>
        <div className="relative" ref={wrapRef}>
          <button onClick={() => setFilterOpen((o) => !o)}
            className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[var(--radius)] border px-[13px] text-[13.5px] font-medium transition-[border-color,background,color] ${
              sort !== "newest" || albumFilter
                ? "border-accent-line bg-accent-soft text-link"
                : "border-border-strong bg-field text-muted hover:border-faint hover:text-fg"
            }`}>
            <SFilter className="h-[17px] w-[17px]" /> Filter
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-40 max-h-[70vh] w-[232px] overflow-y-auto animate-[pop-in_0.16s_var(--ease)] rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-[var(--shadow-lg)]">
              <div className="px-[10px] pb-[5px] pt-2 text-[10.5px] font-[600] uppercase tracking-[0.06em] text-faint">Sort by</div>
              {SORT_OPTIONS.map((s) => (
                <button key={s.key} onClick={() => { setSort(s.key); setFilterOpen(false); }}
                  className={`flex w-full items-center gap-[10px] rounded-lg px-[10px] py-[9px] text-left text-[13.5px] transition-colors hover:bg-bg-2 ${sort === s.key ? "font-[550] text-link" : "text-fg"}`}>
                  <SSort className="h-4 w-4 flex-none text-faint" /> {s.label}
                  {sort === s.key && <SCheck className="ml-auto h-[15px] w-[15px] text-link" />}
                </button>
              ))}
              {albums.length > 0 && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <div className="px-[10px] pb-[5px] pt-2 text-[10.5px] font-[600] uppercase tracking-[0.06em] text-faint">Album</div>
                  <button onClick={() => { setAlbumFilter(null); setFilterOpen(false); }}
                    className={`flex w-full items-center gap-[10px] rounded-lg px-[10px] py-[9px] text-left text-[13.5px] transition-colors hover:bg-bg-2 ${!albumFilter ? "font-[550] text-link" : "text-fg"}`}>
                    <SFolderPlus className="h-4 w-4 flex-none text-faint" /> All albums
                    {!albumFilter && <SCheck className="ml-auto h-[15px] w-[15px] text-link" />}
                  </button>
                  {albums.map((a) => (
                    <button key={a.id} onClick={() => { setAlbumFilter(a.id); setFilterOpen(false); }}
                      className={`flex w-full items-center gap-[10px] rounded-lg px-[10px] py-[9px] text-left text-[13.5px] transition-colors hover:bg-bg-2 ${albumFilter === a.id ? "font-[550] text-link" : "text-fg"}`}>
                      <SFolderPlus className="h-4 w-4 flex-none text-faint" /> <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="text-[11.5px] text-faint">{a.videoIds.length}</span>
                      {albumFilter === a.id && <SCheck className="ml-auto h-[15px] w-[15px] text-link" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <button onClick={() => setMine(!mine)} aria-pressed={mine}
          className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[var(--radius)] border px-[13px] text-[13.5px] font-medium transition-[border-color,background,color] ${
            mine
              ? "border-accent-line bg-accent-soft text-link"
              : "border-border-strong bg-field text-muted hover:border-faint hover:text-fg"
          }`}>
          {mine && <span className="h-[6px] w-[6px] rounded-full bg-link" />}
          <SDownload className="h-[17px] w-[17px]" /> My Imports
        </button>
        <button onClick={onAdd}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[var(--radius)] border-0 bg-accent px-4 text-[13.5px] font-[550] text-on-accent transition-[background] hover:bg-accent-hover active:bg-accent-press">
          <SPlus className="h-4 w-4" /> Add video
        </button>
      </div>
    </div>
  );
}

function Tabs({ active, onPick }: { active: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {CATEGORIES.map((c) => (
        <button key={c} role="tab" aria-selected={active === c} onClick={() => onPick(c)}
          className={`relative flex-none cursor-pointer whitespace-nowrap border-0 bg-transparent px-3 pb-[14px] pt-[13px] text-[13.5px] font-[500] transition-colors ${
            active === c ? "font-[600] text-fg" : "text-faint hover:text-muted"
          }`}>
          {c}
          {active === c && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-[2px] bg-accent" />}
        </button>
      ))}
    </div>
  );
}

function CardRow({
  title, sub, items, openMenu, setOpenMenu, saved, onAction,
}: {
  title: string;
  sub?: string;
  items: LibraryVideo[];
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  saved: Set<string>;
  onAction: (action: string, v: LibraryVideo) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-[38px] last:mb-0">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">
          {title}{sub && <span className="ml-3 text-[12.5px] font-normal normal-case text-faint">{sub}</span>}
        </h2>
      </div>
      <div className="flex gap-5 overflow-x-auto px-1 pb-3 pt-1 [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-bg [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:bg-clip-content">
        {items.map((v) => (
          <div key={v.id} className="w-[268px] flex-none">
            <VideoCardWithMenu v={v} openMenu={openMenu} setOpenMenu={setOpenMenu} saved={saved} onAction={onAction} />
          </div>
        ))}
      </div>
    </section>
  );
}

function VideoCardWithMenu({
  v, openMenu, setOpenMenu, saved, onAction,
}: {
  v: LibraryVideo;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  saved: Set<string>;
  onAction: (action: string, v: LibraryVideo) => void;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const open = openMenu === v.id;
  const isSaved = saved.has(v.id);

  const handleOverflow = () => {
    if (open) { setOpenMenu(null); return; }
    const btn = rootRef.current?.querySelector('button[aria-label="More"]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: Math.max(12, r.right - 196) });
    }
    setOpenMenu(v.id);
  };

  const act = (action: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(null);
    onAction(action, v);
  };

  useEffect(() => {
    if (!open) return;
    const scroller = document.querySelector(".overflow-y-auto");
    const onScroll = () => setOpenMenu(null);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller?.removeEventListener("scroll", onScroll);
  }, [open]);

  const status = STATUS[v.status];

  return (
    <div ref={rootRef}>
      <VideoCard
        title={v.title}
        channel={v.channel ?? ""}
        durationLabel={dur(v.durationS)}
        level={v.level ?? undefined}
        comprehension={v.comprehension ?? undefined}
        thumbnailUrl={v.source === "youtube" ? youtubeThumbnail(v.sourceId) : undefined}
        onPlay={() => router.push(`/videos/${v.id}`)}
        onOverflow={handleOverflow}
      />
      {status && (
        <div className="mt-[10px]">
          <span className={`inline-flex items-center gap-[6px] rounded-full px-[9px] py-[3px] text-[11.5px] font-[500] ${
            status.variant === "error" ? "bg-[var(--error)]/10 text-[var(--error)]" :
            status.variant === "warning" ? "bg-amber-50 text-amber-700" :
            "bg-bg-2 text-muted"
          }`}>
            <span className={`h-[5px] w-[5px] rounded-full ${
              status.variant === "error" ? "bg-[var(--error)]" :
              status.variant === "warning" ? "bg-amber-500" :
              "bg-faint"
            }`} />
            {status.label}
          </span>
        </div>
      )}
      {v.embeddable === false && (
        <div className="mt-[7px]">
          <span
            className="inline-flex items-center gap-[6px] rounded-full bg-amber-50 px-[9px] py-[3px] text-[11.5px] font-[500] text-amber-700"
            title="The owner disabled embedded playback — it won't play inside the app, but captions, dictionary and mining still work."
          >
            <span className="h-[5px] w-[5px] rounded-full bg-amber-500" />
            Not playable in app
          </span>
        </div>
      )}
      {open && menuPos && createPortal(
        <div className="card-menu fixed z-50 w-[192px] animate-[pop-in_0.15s_var(--ease)] rounded-[var(--radius)] border border-border bg-surface p-[6px] shadow-[var(--shadow-lg)]"
          style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
          <button className="flex w-full items-center gap-[11px] rounded-[7px] px-[10px] py-[9px] text-left text-[13px] text-fg transition-colors hover:bg-bg-2" onClick={act("album")}>
            <SFolderPlus className="h-4 w-4 flex-none text-faint" /> Add to album
          </button>
          <button className="flex w-full items-center gap-[11px] rounded-[7px] px-[10px] py-[9px] text-left text-[13px] text-fg transition-colors hover:bg-bg-2" onClick={act("save")}>
            {isSaved ? <SBookmarkFill className="h-4 w-4 flex-none text-faint" /> : <SBookmark className="h-4 w-4 flex-none text-faint" />}
            {isSaved ? "Saved for later" : "Save for later"}
            {isSaved && <span className="ml-auto grid place-items-center"><SCheck className="h-[15px] w-[15px] text-link" /></span>}
          </button>
          <button className="flex w-full items-center gap-[11px] rounded-[7px] px-[10px] py-[9px] text-left text-[13px] text-fg transition-colors hover:bg-bg-2" onClick={act("hide")}>
            <SEyeOff className="h-4 w-4 flex-none text-faint" /> Hide video
          </button>
          <div className="mx-1 my-[5px] h-px bg-border" />
          <button className="flex w-full items-center gap-[11px] rounded-[7px] px-[10px] py-[9px] text-left text-[13px] text-fg transition-colors hover:bg-bg-2" onClick={act("not-interested")}>
            <SFlag className="h-4 w-4 flex-none text-faint" /> Not interested
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

function AddModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const go = () => router.push("/import");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid animate-[scrim-in_0.2s_var(--ease)] place-items-center bg-[rgba(17,22,34,0.30)] p-9 backdrop-blur-[3px]" onMouseDown={onClose}>
      <div className="w-full max-w-[448px] animate-[modal-in_0.34s_var(--ease)] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-[11px] px-5 pb-[18px] pt-[18px]">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-accent-soft-2 text-link">
            <SYoutube className="h-[17px] w-[17px]" />
          </span>
          <span className="text-[15px] font-[600] -tracking-[0.01em]">Add a video</span>
          <button aria-label="Close" onClick={onClose}
            className="ml-auto grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-faint transition-colors hover:bg-bg-2 hover:text-muted">
            <SClose className="h-[17px] w-[17px]" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-1">
          <p className="my-0 mb-[18px] text-[13px] leading-[1.55] text-muted">Paste a link to any Japanese YouTube video and we&apos;ll prepare it for study.</p>
          <div className="relative mb-[14px] flex items-center">
            <SYoutube className="pointer-events-none absolute left-[15px] h-[19px] w-[19px] text-faint" />
            <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
              placeholder="Paste a YouTube link"
              className="h-[50px] w-full rounded-[var(--radius)] border border-border-strong bg-field pl-[46px] pr-[15px] text-[14.5px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]" />
          </div>
          <button onClick={go}
            className="flex h-12 w-full items-center justify-center gap-[9px] rounded-[var(--radius)] border-0 bg-accent px-5 text-[14.5px] font-[550] text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-press">
            Import
          </button>
          <p className="mt-[14px] flex items-center gap-2 text-[12.5px] text-faint">
            <SSpark className="h-[14px] w-[14px]" /> Works with vlogs, news, cooking, gaming — anything in Japanese.
          </p>
        </div>
      </div>
    </div>
  );
}

type AlbumOption = { id: string; name: string; videoCount: number };

function AlbumPickerModal({ video, onClose, onToast }: {
  video: LibraryVideo;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [albums, setAlbums] = useState<AlbumOption[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/albums")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data) => { if (!cancelled) setAlbums(data.albums ?? []); })
      .catch(() => { if (!cancelled) { setAlbums([]); setError("Couldn't load your albums."); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const addTo = async (album: AlbumOption) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/albums/${album.id}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "failed");
      onToast(data.added ? `Added to ${album.name}` : `Already in ${album.name}`);
      onClose();
    } catch {
      setError("Couldn't add to that album. Try again.");
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "failed");
      await addTo({ id: data.album.id, name: data.album.name, videoCount: 0 });
    } catch {
      setError("Couldn't create the album. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid animate-[scrim-in_0.2s_var(--ease)] place-items-center bg-[rgba(17,22,34,0.30)] p-9 backdrop-blur-[3px]" onMouseDown={onClose}>
      <div className="w-full max-w-[400px] animate-[modal-in_0.34s_var(--ease)] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-[11px] px-5 pb-[14px] pt-[18px]">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-accent-soft-2 text-link">
            <SFolderPlus className="h-[17px] w-[17px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-[600] -tracking-[0.01em]">Add to album</span>
            <span className="block truncate text-[12.5px] text-faint">{video.title}</span>
          </span>
          <button aria-label="Close" onClick={onClose}
            className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-faint transition-colors hover:bg-bg-2 hover:text-muted">
            <SClose className="h-[17px] w-[17px]" />
          </button>
        </div>
        <div className="px-4 pb-4">
          {albums === null ? (
            <p className="m-0 px-2 py-6 text-center text-[13px] text-faint">Loading albums…</p>
          ) : albums.length === 0 && !creating ? (
            <p className="m-0 px-2 pb-4 pt-2 text-[13px] leading-[1.55] text-muted">No albums yet. Create your first one to group videos by theme, series, or level.</p>
          ) : (
            <div className="mb-2 max-h-[264px] overflow-y-auto">
              {albums.map((a) => (
                <button key={a.id} disabled={busy} onClick={() => addTo(a)}
                  className="flex w-full items-center gap-[11px] rounded-[9px] px-[10px] py-[10px] text-left text-[13.5px] text-fg transition-colors hover:bg-bg-2 disabled:opacity-60">
                  <SFolderPlus className="h-4 w-4 flex-none text-faint" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="flex-none text-[12px] tabular-nums text-faint">{a.videoCount}</span>
                </button>
              ))}
            </div>
          )}
          {creating ? (
            <div className="flex gap-2">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); }}
                placeholder="Album name" maxLength={100}
                className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border border-border-strong bg-field px-3 text-[13.5px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]" />
              <button onClick={createAndAdd} disabled={busy || !name.trim()}
                className="inline-flex h-10 flex-none items-center rounded-[var(--radius)] border-0 bg-accent px-4 text-[13px] font-[550] text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-press disabled:opacity-60">
                Create
              </button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} disabled={busy}
              className="flex w-full items-center gap-[11px] rounded-[9px] px-[10px] py-[10px] text-left text-[13.5px] font-[550] text-link transition-colors hover:bg-bg-2 disabled:opacity-60">
              <SPlus className="h-4 w-4 flex-none" /> New album
            </button>
          )}
          {error && <p className="m-0 mt-2 px-1 text-[12.5px] text-[var(--error)]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function FirstRun({ onAdd }: { onAdd: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const go = () => router.push("/import");
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col items-center justify-center px-10 pb-20 pt-10 text-center">
      <div className="mb-[26px] grid h-[54px] w-[54px] place-items-center rounded-[15px] bg-accent pb-[2px] font-['Noto_Serif_JP',serif] text-[28px] leading-none text-on-accent">淵</div>
      <h1 className="m-0 mb-3 text-[29px] font-[600] -tracking-[0.02em] leading-[1.18]">Welcome to Fuchine.</h1>
      <p className="mx-auto mb-8 mt-0 max-w-[38ch] text-[15.5px] leading-[1.6] text-muted">
        Learn Japanese by watching what you love. Paste any YouTube video and we&apos;ll turn it into a study session — subtitles, a dictionary, and review built in.
      </p>
      <div className="flex w-full max-w-[440px] gap-[10px]">
        <div className="relative flex flex-1 items-center">
          <SYoutube className="pointer-events-none absolute left-[14px] h-[19px] w-[19px] text-faint" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder="Paste a YouTube link to study"
            className="h-[50px] w-full rounded-[var(--radius)] border border-border-strong bg-field pl-[44px] pr-[14px] text-[14.5px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-faint focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)]" />
        </div>
        <button onClick={go}
          className="inline-flex h-[50px] items-center gap-2 whitespace-nowrap rounded-[var(--radius)] border-0 bg-accent px-5 text-[14.5px] font-[550] text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-press">
          <SPlus className="h-[17px] w-[17px]" /> Add video
        </button>
      </div>
      <div className="mt-[18px] flex items-center gap-2 text-[13px] text-faint">
        <SSpark className="h-[15px] w-[15px]" /> Try a vlog, a news clip, or a cooking video — anything in Japanese works.
      </div>
    </div>
  );
}

export type LibraryAlbum = { id: string; name: string; videoIds: string[] };

export function LibraryView({
  videos, account, reviewDue, stats, activeKey = "library",
  initialSaved = [], initialHidden = [], albums = [],
}: {
  videos: LibraryVideo[];
  account: { name: string; sub?: string };
  reviewDue?: number;
  stats: LibraryStats;
  activeKey?: string;
  initialSaved?: string[];
  initialHidden?: string[];
  albums?: LibraryAlbum[];
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [modal, setModal] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialSaved));
  const [albumFor, setAlbumFor] = useState<LibraryVideo | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const persistFlag = useCallback((videoId: string, flag: string, set: boolean) => {
    fetch(`/api/videos/${videoId}/flags`, {
      method: set ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flag }),
    }).catch(() => {});
  }, []);

  const onAction = useCallback((action: string, v: LibraryVideo) => {
    if (action === "album") {
      setAlbumFor(v);
    } else if (action === "save") {
      const willSave = !saved.has(v.id);
      setSaved((s) => {
        const n = new Set(s);
        willSave ? n.add(v.id) : n.delete(v.id);
        return n;
      });
      persistFlag(v.id, "saved", willSave);
    } else if (action === "hide" || action === "not-interested") {
      const flag = action === "hide" ? "hidden" : "not_interested";
      setHidden((s) => new Set(s).add(v.id));
      persistFlag(v.id, flag, true);
      setToast({
        msg: action === "hide" ? "Video hidden" : "Got it — we'll show less like this",
        undo: () => {
          setHidden((s) => { const n = new Set(s); n.delete(v.id); return n; });
          persistFlag(v.id, flag, false);
        },
      });
    }
  }, [saved, persistFlag]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.overflow-btn, .card-menu, button[aria-label="More"]')) return;
      setOpenMenu(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const firstRun = videos.length === 0;
  const q = query.trim().toLowerCase();

  const activeAlbum = albumFilter ? albums.find((a) => a.id === albumFilter) ?? null : null;
  const albumVideoIds = useMemo(
    () => (activeAlbum ? new Set(activeAlbum.videoIds) : null),
    [activeAlbum],
  );

  const list = useMemo(() => {
    return videos
      .filter((v) => {
        if (hidden.has(v.id)) return false;
        if (albumVideoIds && !albumVideoIds.has(v.id)) return false;
        if (cat !== "All" && v.category !== cat) return false;
        if (mine && v.status !== "done") return false;
        if (q && !(v.title.toLowerCase().includes(q) || (v.channel ?? "").toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "comp") return (b.comprehension ?? 0) - (a.comprehension ?? 0);
        if (sort === "newest") return b.id.localeCompare(a.id);
        if (sort === "short") return (a.durationS ?? 0) - (b.durationS ?? 0);
        if (sort === "level") return (a.level ?? 99) - (b.level ?? 99);
        return 0;
      });
  }, [videos, hidden, albumVideoIds, cat, mine, q, sort]);

  const browsing = cat === "All" && !mine && !q && !albumFilter;
  const continueList = useMemo(
    () => videos.filter((v) => v.comprehension != null && !hidden.has(v.id)).sort((a, b) => (b.comprehension ?? 0) - (a.comprehension ?? 0)),
    [videos, hidden]
  );
  const compList = useMemo(
    () => [...videos].filter((v) => !hidden.has(v.id)).sort((a, b) => (b.comprehension ?? 0) - (a.comprehension ?? 0)).slice(0, 7),
    [videos, hidden]
  );

  const gridHeading = activeAlbum ? activeAlbum.name : mine ? "My imports" : q ? `Results for "${query.trim()}"` : cat === "All" ? "All videos" : cat;
  const gridSub = mine ? `${list.length} of your imports` : q ? `${list.length} found` : `${list.length} videos`;

  return (
    <AppLayout account={account} reviewDue={reviewDue} activeKey={activeKey} collapsed={collapsed} onCollapsedChange={setCollapsed}>
      {firstRun ? (
        <FirstRun onAdd={() => setModal(true)} />
      ) : (
        <>
          <div className="sticky top-0 z-20 border-b border-border bg-[color-mix(in_oklch,var(--bg)_86%,transparent)] backdrop-blur-[14px] saturate-[140%]">
            <TopBar stats={stats} query={query} setQuery={setQuery} sort={sort} setSort={setSort} mine={mine} setMine={setMine} onAdd={() => setModal(true)}
              albums={albums} albumFilter={albumFilter} setAlbumFilter={setAlbumFilter} />
            <Tabs active={cat} onPick={(c) => { setCat(c); setQuery(""); }} />
          </div>
          <div className="px-10 pb-20 pt-[30px]">
            {browsing && continueList.length > 0 && (
              <CardRow title="Continue watching" items={continueList} openMenu={openMenu} setOpenMenu={setOpenMenu} saved={saved} onAction={onAction} />
            )}
            {browsing && compList.length > 0 && (
              <CardRow title="Most comprehensible" sub="— easiest for you right now" items={compList} openMenu={openMenu} setOpenMenu={setOpenMenu} saved={saved} onAction={onAction} />
            )}
            <section className="mb-[38px] last:mb-0">
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 className="m-0 text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">{gridHeading}<span className="ml-3 text-[12.5px] font-normal normal-case text-faint">{gridSub}</span></h2>
              </div>
              {list.length === 0 ? (
                <div className="flex flex-col items-center px-5 pb-[70px] pt-[70px] text-center text-faint">
                  <span className="mb-4 grid h-[46px] w-[46px] place-items-center rounded-[13px] bg-bg-2 text-faint">
                    <SSearch className="h-[22px] w-[22px]" />
                  </span>
                  <p className="m-0 mb-[5px] text-[15px] font-[550] text-muted">No videos here yet</p>
                  <p className="m-0 max-w-[34ch] text-[13px] leading-[1.55]">
                    {mine ? "You haven't imported anything in this category. Paste a link to add one." : "Try another category, or clear your search to see everything."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-x-[22px] gap-y-[30px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))" }}>
                  {list.map((v) => (
                    <VideoCardWithMenu key={v.id} v={v} openMenu={openMenu} setOpenMenu={setOpenMenu} saved={saved} onAction={onAction} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {modal && <AddModal onClose={() => setModal(false)} />}
      {albumFor && (
        <AlbumPickerModal video={albumFor} onClose={() => setAlbumFor(null)} onToast={(msg) => setToast({ msg })} />
      )}
      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-[90] inline-flex -translate-x-1/2 animate-[home-toast-in_0.22s_var(--ease)] items-center gap-[10px] rounded-full bg-fg px-[18px] py-3 text-[13.5px] font-[550] text-surface shadow-[var(--shadow-lg)]">
          <SCheck className="h-4 w-4" />
          {toast.msg}
          {toast.undo && <button onClick={() => { toast.undo?.(); setToast(null); }} className="ml-[2px] cursor-pointer border-0 bg-transparent pl-1 text-[13px] font-[700] text-[var(--accent-2,#9db4ff)] hover:underline">Undo</button>}
        </div>
      )}
    </AppLayout>
  );
}
