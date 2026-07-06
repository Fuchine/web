"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import "./album-detail.css";

type IcProps = React.SVGProps<SVGSVGElement>;
const stroke = (paths: React.ReactNode) => (props: IcProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths}</svg>
);
const fill = (paths: React.ReactNode) => (props: IcProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>{paths}</svg>
);
const IcAlbums = stroke(<><rect x="3.5" y="4.5" width="11" height="11" rx="1.5" /><path d="M7.5 8.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 8 18z" /></>);
const IcArrow = stroke(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
const IcPlay = fill(<path d="M8 5.5v13l11-6.5z" />);
const IcPlus = stroke(<path d="M12 5v14M5 12h14" />);
const IcMore = fill(<><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>);
const IcBookmark = stroke(<path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z" />);
const IcBookmarkFill = fill(<path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z" />);
const IcCards = stroke(<><rect x="3.5" y="7" width="12" height="12" rx="1.6" /><path d="M7 4.5h11a1.5 1.5 0 0 1 1.5 1.5v11" /></>);
const IcClose = stroke(<path d="M6 6l12 12M18 6 6 18" />);
const IcSort = stroke(<><path d="M7 5v14" /><path d="M4 16l3 3 3-3" /><path d="M14 7h6M14 12h4M14 17h2" /></>);

const TONES = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;
function tone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
const LEVEL_N: Record<string, number> = { beginner: 1, intermediate: 3, advanced: 5 };
function dur(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export type DetailVideo = {
  id: string;
  title: string;
  channel: string | null;
  durationS: number | null;
  level: string | null;
  comprehension: number | null;
};

export type AlbumDetailData = {
  id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  words: number;
  pct: number;
  videos: DetailVideo[];
};

function Cover({ ids }: { ids: string[] }) {
  if (ids.length === 0) {
    return (
      <div className="ad-cover cells-1">
        <div className="ad-cell t3"><span className="ad-cover-glyph"><IcAlbums /></span></div>
      </div>
    );
  }
  const n = Math.min(ids.length, 4);
  const cells = ids.slice(0, 4);
  while (cells.length < 4) cells.push(cells[cells.length - 1]);
  return (
    <div className={"ad-cover cells-" + n}>
      {cells.map((id, i) => <div key={i} className={"ad-cell " + tone(id)} />)}
    </div>
  );
}

function CompRing({ pct }: { pct: number }) {
  const r = 10, c = 2 * Math.PI * r;
  return (
    <span className="ad-comp" title={"Comprehension " + pct + "%"}>
      <svg className="ring" viewBox="0 0 26 26">
        <circle className="track" cx="13" cy="13" r={r} />
        <circle className="val" cx="13" cy="13" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="pct">{pct}%</span>
    </span>
  );
}

function Row({ v, idx, onPlay, onRemove }: { v: DetailVideo; idx: number; onPlay: () => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);
  const d = dur(v.durationS);
  const lvl = v.level ? LEVEL_N[v.level] : null;
  return (
    <li className="ad-row">
      <span className="ad-idx">{idx}</span>
      <button className={"ad-thumb " + tone(v.id)} onClick={onPlay} aria-label={v.title}>
        {lvl != null && <span className="lvl">LVL {lvl}</span>}
        <span className="play"><IcPlay /></span>
        {d && <span className="dur">{d}</span>}
      </button>
      <div className="ad-vmeta">
        <span className="ad-vtitle">{v.title}</span>
        <span className="ad-vsub">
          <span className="ad-chan">{v.channel ?? "Unknown channel"}</span>
        </span>
      </div>
      {v.comprehension != null && <CompRing pct={v.comprehension} />}
      <button className="ad-more" ref={ref} aria-label="More" onClick={() => setMenu((m) => !m)}>
        <IcMore />
        {menu && (
          <div className="ad-rowmenu" role="menu" onClick={(e) => e.stopPropagation()}>
            <button className="ad-mi" onClick={() => { setMenu(false); onPlay(); }}><IcPlay /><span className="mi-label">Play</span></button>
            <button className="ad-mi danger" onClick={() => { setMenu(false); onRemove(); }}><IcClose /><span className="mi-label">Remove from album</span></button>
          </div>
        )}
      </button>
    </li>
  );
}

export function AlbumDetailView({ album: initial, account, reviewDue }: {
  album: AlbumDetailData;
  account: { name: string; sub?: string };
  reviewDue?: number;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [album, setAlbum] = useState(initial);
  const [pinned, setPinned] = useState(initial.pinned);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const menuWrap = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => { setMenuOpen(false); setConfirming(false); }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuWrap.current && !menuWrap.current.contains(e.target as Node)) closeMenu(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [menuOpen, closeMenu]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const videos = album.videos;
  const empty = videos.length === 0;
  const totalSec = videos.reduce((s, v) => s + (v.durationS ?? 0), 0);
  const hrs = Math.floor(totalSec / 3600), mins = Math.round((totalSec % 3600) / 60);
  const runtime = hrs ? `${hrs}h ${mins}m` : `${mins}m`;
  const coverIds = videos.map((v) => v.id);
  const firstVideo = videos[0];

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    closeMenu();
    setToast(next ? "Pinned to top" : "Unpinned from top");
    fetch(`/api/albums/${album.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pinned: next }) }).catch(() => {});
  };
  const duplicate = () => {
    closeMenu();
    void (async () => {
      const res = await fetch("/api/albums", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `${album.name} (copy)`, description: album.description ?? undefined }) });
      if (!res.ok) return;
      const { album: copy } = await res.json();
      for (const v of videos) {
        await fetch(`/api/albums/${copy.id}/videos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId: v.id }) }).catch(() => {});
      }
      setToast("Album duplicated");
    })();
  };
  const removeAlbum = () => {
    closeMenu();
    fetch(`/api/albums/${album.id}`, { method: "DELETE" }).catch(() => {});
    router.push("/albums");
  };
  const removeVideo = (videoId: string) => {
    setAlbum((a) => ({ ...a, videos: a.videos.filter((v) => v.id !== videoId) }));
    fetch(`/api/albums/${album.id}/videos`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId }) }).catch(() => {});
    setToast("Removed from album");
  };

  return (
    <AppLayout account={account} reviewDue={reviewDue} activeKey="albums" collapsed={collapsed} onCollapsedChange={setCollapsed}>
      <div className="ad-content">
        <button className="ad-back ad-rise" onClick={() => router.push("/albums")}>
          <IcArrow /> Albums
        </button>

        <header className="ad-hero ad-rise">
          <Cover ids={coverIds} />
          <div className="ad-info">
            <div className="ad-kicker"><IcAlbums /> Album</div>
            <div className="ad-title-row">
              <h1 className="ad-title">{album.name}</h1>
              {pinned && <span className="ad-pin" title="Pinned"><IcBookmarkFill /></span>}
            </div>
            {album.description && <p className="ad-desc">{album.description}</p>}

            {empty ? (
              <div className="ad-meta"><b>0</b> videos · ready when you are</div>
            ) : (
              <>
                <div className="ad-meta">
                  <span><b>{videos.length}</b> videos</span><span className="dot" />
                  <span><b>{album.words}</b> words</span><span className="dot" />
                  <span>{runtime} total</span>
                </div>
                <div className="ad-prog">
                  <div className="ad-prog-track"><div className="ad-prog-fill" style={{ width: album.pct + "%" }} /></div>
                  <span className="ad-prog-pct">{album.pct}% comprehension</span>
                </div>
              </>
            )}

            <div className="ad-actions">
              {empty ? (
                <button className="ad-btn primary" onClick={() => router.push("/library")}><IcPlus /> Add videos</button>
              ) : (
                <>
                  <button className="ad-btn primary" onClick={() => firstVideo && router.push(`/videos/${firstVideo.id}`)}>
                    <IcPlay /> Start watching
                  </button>
                  <button className="ad-btn ghost" onClick={() => router.push("/library")}><IcPlus /> Add videos</button>
                  <div className="ad-menu-wrap" ref={menuWrap}>
                    <button className={"ad-icon" + (menuOpen ? " on" : "")} title="Album options"
                      aria-haspopup="true" aria-expanded={menuOpen}
                      onClick={() => { setMenuOpen((o) => !o); setConfirming(false); }}>
                      <IcMore />
                    </button>
                    {menuOpen && (
                      <div className="ad-menu" role="menu">
                        {confirming ? (
                          <div className="ad-confirm">
                            <div className="ad-confirm-t">Remove this album?</div>
                            <p className="ad-confirm-p">The album is deleted, but its {videos.length} videos and your progress stay in your library.</p>
                            <div className="ad-confirm-row">
                              <button onClick={() => setConfirming(false)}>Keep</button>
                              <button className="danger" onClick={removeAlbum}>Remove</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button className="ad-mi" role="menuitem" onClick={() => firstVideo && router.push(`/videos/${firstVideo.id}`)}>
                              <IcPlay /><span className="mi-label">Play from start</span>
                            </button>
                            <button className="ad-mi" role="menuitem" onClick={togglePin}>
                              {pinned ? <IcBookmark /> : <IcBookmarkFill />}
                              <span className="mi-label">{pinned ? "Unpin from top" : "Pin to top"}</span>
                            </button>
                            <button className="ad-mi" role="menuitem" onClick={duplicate}>
                              <IcCards /><span className="mi-label">Duplicate album</span>
                            </button>
                            <div className="ad-msep" />
                            <button className="ad-mi danger" role="menuitem" onClick={() => setConfirming(true)}>
                              <IcClose /><span className="mi-label">Remove album</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {empty ? (
          <div className="ad-empty ad-rise-2">
            <span className="ad-empty-ic"><IcAlbums /></span>
            <h3>No videos in this album yet</h3>
            <p>Add videos from your library to start building this collection. Your progress and mined words will gather here.</p>
            <button className="ad-btn primary" onClick={() => router.push("/library")}><IcPlus /> Browse library</button>
          </div>
        ) : (
          <div className="ad-rise-2">
            <div className="ad-list-head">
              <span className="ad-list-title">Videos<span>{videos.length}</span></span>
              <span className="ad-list-sort"><IcSort /> Album order</span>
            </div>
            <ul className="ad-list">
              {videos.map((v, i) => (
                <Row key={v.id} v={v} idx={i + 1}
                  onPlay={() => router.push(`/videos/${v.id}`)}
                  onRemove={() => removeVideo(v.id)} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {toast && <div className="ad-toast"><IcBookmarkFill /> {toast}</div>}
    </AppLayout>
  );
}
