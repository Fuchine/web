"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import "./albums.css";

// --- icons (ported 1:1 from claude-design/icons.jsx) ---
type IcProps = React.SVGProps<SVGSVGElement>;
const stroke = (paths: React.ReactNode) => (props: IcProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths}</svg>
);
const fill = (paths: React.ReactNode) => (props: IcProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>{paths}</svg>
);
const IcAlbums = stroke(<><rect x="3.5" y="4.5" width="11" height="11" rx="1.5" /><path d="M7.5 8.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 8 18z" /></>);
const IcFolderPlus = stroke(<><path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.6l2 2.4H19a1.5 1.5 0 0 1 1.5 1.5v7.6a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M12 11.6v4.2M9.9 13.7h4.2" /></>);
const IcPlus = stroke(<path d="M12 5v14M5 12h14" />);
const IcCheck = stroke(<path d="M5 12.5 10 17.5 19 7" />);
const IcClose = stroke(<path d="M6 6l12 12M18 6 6 18" />);
const IcPlay = fill(<path d="M8 5.5v13l11-6.5z" />);
const IcMore = fill(<><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>);
const IcBookmark = stroke(<path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z" />);
const IcBookmarkFill = fill(<path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z" />);
const IcText = stroke(<><path d="M5 7V5.5h14V7" /><path d="M12 5.5v13" /><path d="M9.5 18.5h5" /></>);
const IcCards = stroke(<><rect x="3.5" y="7" width="12" height="12" rx="1.6" /><path d="M7 4.5h11a1.5 1.5 0 0 1 1.5 1.5v11" /></>);

export type AlbumCardData = {
  id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  videoCount: number;
  words: number;
  pct: number;
  coverIds: string[];
};

export type PickerVideo = {
  id: string;
  title: string;
  channel: string | null;
  durationS: number | null;
};

const COVERS = ["c1", "c2", "c3", "c4"] as const;

/** Deterministic cover tone (c1..c4) from an id, so mosaics are stable. */
function tone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[h % 4];
}

function dur(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/* ---------------- Cover ---------------- */
function Cover({ coverIds, videoCount, solid }: { coverIds: string[]; videoCount: number; solid?: string }) {
  if (coverIds.length === 0) {
    return (
      <div className="alb-cover cells-1">
        <div className={"alb-tile " + (solid ?? "c2")}>
          <span className="na-cover-glyph"><IcAlbums /></span>
        </div>
        <span className="alb-count"><IcAlbums /> {videoCount}</span>
      </div>
    );
  }
  const n = Math.min(coverIds.length, 4);
  const cells = coverIds.slice(0, 4);
  while (cells.length < 4) cells.push(cells[cells.length - 1]);
  return (
    <div className={"alb-cover cells-" + n}>
      {cells.map((id, i) => (
        <div key={i} className={"alb-tile " + tone(id)}>
          {i === 0 && <span className="alb-play"><IcPlay /></span>}
        </div>
      ))}
      <span className="alb-count"><IcAlbums /> {videoCount}</span>
    </div>
  );
}

/* ---------------- Card menu ---------------- */
function AlbumMenu({ pinned, onClose, onAction }: { pinned: boolean; onClose: () => void; onAction: (k: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const item = (key: string, Icon: (p: IcProps) => React.ReactElement, label: string, danger?: boolean) => (
    <button className={"alb-mi" + (danger ? " danger" : "")} onClick={(e) => { e.stopPropagation(); onAction(key); }}>
      <Icon /> {label}
    </button>
  );
  return (
    <div className="alb-menu" ref={ref} role="menu" onClick={(e) => e.stopPropagation()}>
      {item("open", IcAlbums, "Open album")}
      {item("pin", pinned ? IcBookmarkFill : IcBookmark, pinned ? "Unpin" : "Pin to top")}
      {item("rename", IcText, "Rename")}
      {item("duplicate", IcCards, "Duplicate")}
      <div className="alb-msep" />
      {item("remove", IcClose, "Remove album", true)}
    </div>
  );
}

/* ---------------- Card ---------------- */
function AlbumCard({
  album, menuOpen, renaming, renameDraft, onOpen, onMenu, onAction, onRenameChange, onRenameCommit,
}: {
  album: AlbumCardData; menuOpen: boolean; renaming: boolean; renameDraft: string;
  onOpen: () => void; onMenu: () => void; onAction: (k: string) => void;
  onRenameChange: (v: string) => void; onRenameCommit: (cancel?: boolean) => void;
}) {
  return (
    <div className="alb-card" onClick={() => { if (!renaming) onOpen(); }}>
      <Cover coverIds={album.coverIds} videoCount={album.videoCount} />
      <div className="alb-meta">
        <div className="alb-titlerow">
          {renaming ? (
            <input className="alb-rename" autoFocus value={renameDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={() => onRenameCommit()}
              onKeyDown={(e) => { if (e.key === "Enter") onRenameCommit(); if (e.key === "Escape") onRenameCommit(true); }} />
          ) : (
            <>
              <span className="alb-title">{album.name}</span>
              {album.pinned && <span className="alb-pin" title="Pinned"><IcBookmarkFill /></span>}
              <button className={"alb-menu-btn" + (menuOpen ? " open" : "")}
                aria-label="Album options" aria-haspopup="menu"
                onClick={(e) => { e.stopPropagation(); onMenu(); }}>
                <IcMore />
              </button>
              {menuOpen && <AlbumMenu pinned={album.pinned} onClose={onMenu} onAction={onAction} />}
            </>
          )}
        </div>
        <div className="alb-sub">{album.videoCount} videos · {album.words} words</div>
        <div className="alb-prog">
          <div className="alb-track"><div className="alb-fill" style={{ width: album.pct + "%" }} /></div>
          <span className="alb-pct">{album.pct}%</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- New Album modal ---------------- */
function NewAlbumModal({ videos, onClose, onCreate }: {
  videos: PickerVideo[];
  onClose: () => void;
  onCreate: (input: { name: string; description: string; picked: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cover, setCover] = useState<string>("c2");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleVid = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickedIds = videos.filter((v) => picked.includes(v.id)).map((v) => v.id);
  const canCreate = name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), description: desc.trim(), picked });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="na-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="na-modal" role="dialog" aria-label="New album">
        <div className="na-head">
          <span className="na-hmark"><IcFolderPlus /></span>
          <div className="na-htitles">
            <div className="na-htitle">New album</div>
            <div className="na-hsub">Group videos by theme or goal</div>
          </div>
          <button className="na-close" onClick={onClose} aria-label="Close"><IcClose /></button>
        </div>

        <div className="na-body">
          <div className="na-top">
            <div className="na-left">
              <Cover coverIds={pickedIds} videoCount={pickedIds.length} solid={cover} />
              <div className="na-colors">
                {COVERS.map((c) => (
                  <button key={c} className={"na-sw " + c + (cover === c ? " on" : "")}
                    onClick={() => setCover(c)} aria-label={"Cover " + c} title="Cover color" />
                ))}
              </div>
            </div>

            <div className="na-fields">
              <div className="na-field">
                <label className="na-label" htmlFor="na-name">Album name</label>
                <input id="na-name" className="na-input" value={name} autoFocus
                  onChange={(e) => setName(e.target.value)} placeholder="e.g. Slow life vlogs" />
              </div>
              <div className="na-field">
                <label className="na-label" htmlFor="na-desc">Description <span className="opt">· optional</span></label>
                <textarea id="na-desc" className="na-input" value={desc}
                  onChange={(e) => setDesc(e.target.value)} placeholder="What ties these videos together?" />
              </div>
            </div>
          </div>

          <div className="na-sec">
            <div className="na-sec-head">
              <span className="na-sec-title">Add videos</span>
              <span className="na-sec-count">{picked.length ? picked.length + " selected" : "Optional"}</span>
            </div>
            <div className="na-vids">
              {videos.length === 0 ? (
                <div className="na-empty">Import videos in your library first — then group them here.</div>
              ) : videos.map((v) => {
                const on = picked.includes(v.id);
                const d = dur(v.durationS);
                return (
                  <button key={v.id} className={"na-vid" + (on ? " on" : "")} onClick={() => toggleVid(v.id)}>
                    <span className={"na-vthumb alb-tile " + tone(v.id)}>{d && <span className="dur">{d}</span>}</span>
                    <span className="na-vmeta">
                      <span className="na-vtitle">{v.title}</span>
                      <span className="na-vsub">{v.channel ?? "Unknown"}{d ? ` · ${d}` : ""}</span>
                    </span>
                    <span className="na-vcheck"><IcCheck /></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="na-foot">
          <span className="na-fhint">You can add more videos anytime.</span>
          <button className="na-btn ghost" onClick={onClose}>Cancel</button>
          <button className="na-btn primary" disabled={!canCreate} onClick={() => void submit()}>
            <IcCheck /> Create album
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- View ---------------- */
export function AlbumsView({
  albums: initial, libraryVideos, account, reviewDue,
}: {
  albums: AlbumCardData[];
  libraryVideos: PickerVideo[];
  account: { name: string; sub?: string };
  reviewDue?: number;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [albums, setAlbums] = useState<AlbumCardData[]>(initial);
  const [creating, setCreating] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const sortPinned = (list: AlbumCardData[]) =>
    [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const createAlbum = useCallback(async ({ name, description, picked }: { name: string; description: string; picked: string[] }) => {
    const res = await fetch("/api/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    if (!res.ok) return;
    const { album } = await res.json();
    for (const videoId of picked) {
      await fetch(`/api/albums/${album.id}/videos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId }),
      }).catch(() => {});
    }
    setAlbums((list) => [
      { id: album.id, name: album.name, description: album.description, pinned: false, videoCount: picked.length, words: 0, pct: 0, coverIds: picked.slice(0, 4) },
      ...list,
    ]);
    setCreating(false);
    router.refresh();
  }, [router]);

  const toggleMenu = (id: string) => setMenuId((cur) => (cur === id ? null : id));

  const commitRename = (cancel?: boolean) => {
    const id = renameId;
    const draft = renameDraft.trim();
    setRenameId(null);
    setRenameDraft("");
    if (cancel || !id || !draft) return;
    setAlbums((list) => list.map((a) => (a.id === id ? { ...a, name: draft } : a)));
    fetch(`/api/albums/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: draft }),
    }).catch(() => {});
  };

  const handleAction = (id: string, key: string) => {
    const album = albums.find((a) => a.id === id);
    if (!album) return;
    setMenuId(null);
    if (key === "open") { router.push(`/albums/${id}`); return; }
    if (key === "pin") {
      const pinned = !album.pinned;
      setAlbums((list) => sortPinned(list.map((a) => (a.id === id ? { ...a, pinned } : a))));
      fetch(`/api/albums/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pinned }) }).catch(() => {});
    } else if (key === "rename") {
      setRenameId(id); setRenameDraft(album.name);
    } else if (key === "duplicate") {
      void (async () => {
        const res = await fetch("/api/albums", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: `${album.name} (copy)`, description: album.description ?? undefined }),
        });
        if (!res.ok) return;
        const { album: copy } = await res.json();
        for (const videoId of album.coverIds) {
          await fetch(`/api/albums/${copy.id}/videos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId }) }).catch(() => {});
        }
        router.refresh();
      })();
    } else if (key === "remove") {
      setAlbums((list) => list.filter((a) => a.id !== id));
      fetch(`/api/albums/${id}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const totalVids = albums.reduce((s, a) => s + a.videoCount, 0);

  return (
    <AppLayout account={account} reviewDue={reviewDue} activeKey="albums" collapsed={collapsed} onCollapsedChange={setCollapsed}>
      <div className="alb-content">
        <div className="alb-head alb-rise">
          <div>
            <h1>Albums</h1>
            <p>{albums.length} collections · {totalVids} videos organized</p>
          </div>
          <button className="alb-newbtn" onClick={() => setCreating(true)}><IcFolderPlus /> New album</button>
        </div>

        <div className="alb-grid alb-rise-2">
          <button className="alb-new" onClick={() => setCreating(true)}>
            <span className="alb-new-ic"><IcPlus /></span>
            <span className="alb-new-t">New album</span>
            <span className="alb-new-s">Group videos by theme or goal</span>
          </button>

          {albums.map((a) => (
            <AlbumCard key={a.id} album={a}
              menuOpen={menuId === a.id}
              renaming={renameId === a.id}
              renameDraft={renameDraft}
              onOpen={() => router.push(`/albums/${a.id}`)}
              onMenu={() => toggleMenu(a.id)}
              onAction={(key) => handleAction(a.id, key)}
              onRenameChange={setRenameDraft}
              onRenameCommit={commitRename} />
          ))}
        </div>
      </div>

      {creating && (
        <NewAlbumModal videos={libraryVideos} onClose={() => setCreating(false)} onCreate={createAlbum} />
      )}
    </AppLayout>
  );
}
