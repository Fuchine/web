/* Fuchine — Albums (video collections) */
const { useState, useEffect } = React;

const ALBUMS = [
  { id: 1, title: 'Slow life vlogs', videos: 8, words: 142, pct: 64, tiles: ['c1','c2','c3','c4'], pinned: true },
  { id: 2, title: 'News & weather', videos: 5, words: 88, pct: 30, tiles: ['c2','c4','c1'] },
  { id: 3, title: 'Cooking & recipes', videos: 6, words: 96, pct: 80, tiles: ['c3','c1','c2','c4'] },
  { id: 4, title: 'JLPT N4 grammar', videos: 12, words: 210, pct: 45, tiles: ['c4','c3','c2','c1'] },
  { id: 5, title: 'Travel & places', videos: 4, words: 52, pct: 12, tiles: ['c1','c3'] },
  { id: 6, title: 'Interviews', videos: 3, words: 40, pct: 0, tiles: ['c2','c4','c3'], fresh: true },
];

/* videos available to drop into a new album */
const LIBRARY = [
  { id: 'v1', title: '朝の京都を歩く — Morning walk in Kyoto', channel: 'Kyoto Slow Living', dur: '14:22', tile: 'c1' },
  { id: 'v2', title: '今日の天気予報 — Today’s forecast', channel: 'NHK Easy News', dur: '3:48', tile: 'c2' },
  { id: 'v3', title: '簡単な味噌汁の作り方', channel: 'Cooking with Yuki', dur: '8:05', tile: 'c3' },
  { id: 'v4', title: 'JLPT N4 文法 まとめ', channel: 'Nihongo Lab', dur: '22:10', tile: 'c4' },
  { id: 'v5', title: '沖縄の海を旅する — Okinawa', channel: 'Travel Japan', dur: '11:30', tile: 'c1' },
];

const COVERS = ['c1', 'c2', 'c3', 'c4'];

/* live cover preview — mosaic of picked videos, or a solid cover */
function PreviewCover({ tiles, cover }) {
  if (!tiles.length) {
    return (
      <div className="alb-cover na-cover cells-1">
        <div className={'alb-tile ' + cover}>
          <span className="na-cover-glyph"><Ic.albums /></span>
        </div>
      </div>
    );
  }
  const n = Math.min(tiles.length, 4);
  const cells = tiles.slice(0, 4);
  while (cells.length < 4) cells.push(cells[cells.length - 1]);
  return (
    <div className={'alb-cover na-cover cells-' + n}>
      {cells.map((c, i) => <div key={i} className={'alb-tile ' + c} />)}
    </div>
  );
}

/* ---------------- New Album dialog ---------------- */
function NewAlbumModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [cover, setCover] = useState('c2');
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleVid = (id) =>
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const pickedTiles = LIBRARY.filter((v) => picked.includes(v.id)).map((v) => v.tile);
  const canCreate = name.trim().length > 0;

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      title: name.trim(),
      videos: picked.length,
      words: 0,
      pct: 0,
      tiles: pickedTiles.length ? pickedTiles : [cover],
      fresh: true,
    });
  };

  return (
    <div className="na-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="na-modal" role="dialog" aria-label="New album">
        <div className="na-head">
          <span className="na-hmark"><Ic.folderPlus /></span>
          <div className="na-htitles">
            <div className="na-htitle">New album</div>
            <div className="na-hsub">Group videos by theme or goal</div>
          </div>
          <button className="na-close" onClick={onClose} aria-label="Close"><Ic.close /></button>
        </div>

        <div className="na-body">
          <div className="na-top">
            <div className="na-left">
              <PreviewCover tiles={pickedTiles} cover={cover} />
              <div className="na-colors">
                {COVERS.map((c) => (
                  <button key={c} className={'na-sw ' + c + (cover === c ? ' on' : '')}
                    onClick={() => setCover(c)} aria-label={'Cover ' + c}
                    title="Cover color" />
                ))}
              </div>
            </div>

            <div className="na-fields">
              <div className="na-field">
                <label className="na-label" htmlFor="na-name">Album name</label>
                <input id="na-name" className="na-input" value={name} autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Slow life vlogs" />
              </div>
              <div className="na-field">
                <label className="na-label" htmlFor="na-desc">Description <span className="opt">· optional</span></label>
                <textarea id="na-desc" className="na-input" value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="What ties these videos together?" />
              </div>
            </div>
          </div>

          <div className="na-sec">
            <div className="na-sec-head">
              <span className="na-sec-title">Add videos</span>
              <span className="na-sec-count">{picked.length ? picked.length + ' selected' : 'Optional'}</span>
            </div>
            <div className="na-vids">
              {LIBRARY.map((v) => {
                const on = picked.includes(v.id);
                return (
                  <button key={v.id} className={'na-vid' + (on ? ' on' : '')} onClick={() => toggleVid(v.id)}>
                    <span className={'na-vthumb alb-tile ' + v.tile}><span className="dur">{v.dur}</span></span>
                    <span className="na-vmeta">
                      <span className="na-vtitle">{v.title}</span>
                      <span className="na-vsub">{v.channel} · {v.dur}</span>
                    </span>
                    <span className="na-vcheck"><Ic.check /></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="na-foot">
          <span className="na-fhint">You can add more videos anytime.</span>
          <button className="na-btn ghost" onClick={onClose}>Cancel</button>
          <button className="na-btn primary" disabled={!canCreate} onClick={submit}>
            <Ic.check /> Create album
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function Sidebar({ collapsed, onToggle }) {
  const items = [
    { key: 'home', icon: Ic.home, label: 'Home', href: 'Dashboard.html' },
    { key: 'library', icon: Ic.library, label: 'Library', href: 'Home.html' },
    { key: 'albums', icon: Ic.albums, label: 'Albums', active: true },
    { key: 'review', icon: Ic.review, label: 'Review', href: 'Review.html' },
    { key: 'dict', icon: Ic.dict, label: 'Dictionary', href: 'Dictionary.html' },
    { key: 'phrases', icon: Ic.phrases, label: 'Phrases', href: 'Phrases.html' },
    { key: 'stats', icon: Ic.stats, label: 'Stats', href: 'Stats.html' },
    { key: 'settings', icon: Ic.settings, label: 'Settings', href: 'Settings.html' },
  ];
  return (
    <aside className="side">
      <div className="side-head">
        <span className="brand-mark">淵</span>
        <span className="brand-name">Fuchine</span>
        <button className="collapse-btn" onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label="Toggle sidebar">
          <Ic.chevron />
        </button>
      </div>
      <nav className="nav">
        {items.map((it) => {
          const I = it.icon;
          return (
            <button key={it.key} className={'nav-item' + (it.active ? ' active' : '')}
              title={collapsed ? it.label : undefined}
              onClick={() => { if (it.href) window.location.href = it.href; }}>
              <I /><span className="nav-text">{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="side-spacer" />
      <div className="side-foot">
        <button className="account">
          <span className="avatar">M</span>
          <span className="account-meta">
            <span className="account-name">Mai Tanaka</span>
            <span className="account-mail">mai@fuchi.app</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

function Cover({ tiles, videos }) {
  // fill to 4 cells for the mosaic
  const cells = tiles.slice(0, 4);
  while (cells.length < 4) cells.push(cells[cells.length - 1]);
  return (
    <div className={'alb-cover cells-' + Math.min(tiles.length, 4)}>
      {cells.map((c, i) => (
        <div key={i} className={'alb-tile ' + c}>
          {i === 0 && <span className="alb-play"><Ic.play /></span>}
        </div>
      ))}
      <span className="alb-count"><Ic.albums /> {videos}</span>
    </div>
  );
}

/* ---------------- Card menu (three dots) ---------------- */
function AlbumMenu({ album, onClose, onAction }) {
  const ref = React.useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const item = (key, icon, label, opts = {}) => {
    const I = icon;
    return (
      <button className={'alb-mi' + (opts.danger ? ' danger' : '')}
        onClick={(e) => { e.stopPropagation(); onAction(key); }}>
        <I /> {label}
      </button>
    );
  };

  return (
    <div className="alb-menu" ref={ref} role="menu" onClick={(e) => e.stopPropagation()}>
      {item('open', Ic.albums, 'Open album')}
      {item('pin', album.pinned ? Ic.bookmarkFill : Ic.bookmark, album.pinned ? 'Unpin' : 'Pin to top')}
      {item('rename', Ic.text, 'Rename')}
      {item('duplicate', Ic.cards, 'Duplicate')}
      <div className="alb-msep" />
      {item('remove', Ic.close, 'Remove album', { danger: true })}
    </div>
  );
}

/* ---------------- Album card ---------------- */
function AlbumCard({ album, menuOpen, renaming, renameDraft, onMenu, onAction, onRenameChange, onRenameCommit }) {
  const open = () => { if (!renaming) window.location.href = 'AlbumDetail.html'; };
  return (
    <div className="alb-card" onClick={open}>
      <Cover tiles={album.tiles} videos={album.videos} />
      <div className="alb-meta">
        <div className="alb-titlerow">
          {renaming ? (
            <input className="alb-rename" autoFocus value={renameDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameCommit}
              onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCommit(true); }} />
          ) : (
            <>
              <span className="alb-title">{album.title}</span>
              {album.pinned && <span className="alb-pin" title="Pinned"><Ic.bookmarkFill /></span>}
              {album.fresh && <span className="alb-fresh">New</span>}
              <button className={'alb-menu-btn' + (menuOpen ? ' open' : '')}
                aria-label="Album options" aria-haspopup="menu"
                onClick={(e) => { e.stopPropagation(); onMenu(); }}>
                <Ic.more />
              </button>
              {menuOpen && <AlbumMenu album={album} onClose={onMenu} onAction={onAction} />}
            </>
          )}
        </div>
        <div className="alb-sub">{album.videos} videos · {album.words} words</div>
        <div className="alb-prog">
          <div className="alb-track"><div className="alb-fill" style={{ width: album.pct + '%' }} /></div>
          <span className="alb-pct">{album.pct}%</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "collapsed": false,
  "dialog": "closed"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useState(t.collapsed);
  const [albums, setAlbums] = useState(ALBUMS);
  const [creating, setCreating] = useState(t.dialog !== 'closed');

  useEffect(() => { setCollapsed(t.collapsed); }, [t.collapsed]);
  useEffect(() => { setCreating(t.dialog !== 'closed'); }, [t.dialog]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', t.theme); }, [t.theme]);
  const toggle = () => { const n = !collapsed; setCollapsed(n); setTweak('collapsed', n); };

  const openDialog = () => { setCreating(true); setTweak('dialog', 'open'); };
  const closeDialog = () => { setCreating(false); setTweak('dialog', 'closed'); };
  const createAlbum = (album) => {
    setAlbums((list) => [{ id: Date.now(), ...album }, ...list]);
    closeDialog();
  };

  /* three-dots menu + inline rename */
  const [menuId, setMenuId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');

  const toggleMenu = (id) => setMenuId((cur) => (cur === id ? null : id));

  const startRename = (a) => { setRenameId(a.id); setRenameDraft(a.title); setMenuId(null); };
  const commitRename = (cancel) => {
    if (!cancel) {
      const t = renameDraft.trim();
      if (t) setAlbums((list) => list.map((a) => (a.id === renameId ? { ...a, title: t } : a)));
    }
    setRenameId(null); setRenameDraft('');
  };

  const handleAction = (id, key) => {
    const album = albums.find((a) => a.id === id);
    if (!album) return;
    setMenuId(null);
    if (key === 'open') { window.location.href = 'AlbumDetail.html'; return; }
    if (key === 'pin') {
      setAlbums((list) => {
        const next = list.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a));
        return [...next].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      });
    } else if (key === 'rename') {
      startRename(album);
    } else if (key === 'duplicate') {
      setAlbums((list) => {
        const i = list.findIndex((a) => a.id === id);
        const copy = { ...album, id: Date.now(), title: album.title + ' (copy)', pinned: false, fresh: true };
        const next = [...list];
        next.splice(i + 1, 0, copy);
        return next;
      });
    } else if (key === 'remove') {
      setAlbums((list) => list.filter((a) => a.id !== id));
    }
  };

  const totalVids = albums.reduce((s, a) => s + a.videos, 0);

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="main">
        <div className="content alb-content">
          <div className="alb-head rise">
            <div>
              <h1>Albums</h1>
              <p>{albums.length} collections · {totalVids} videos organized</p>
            </div>
            <button className="btn-primary" onClick={openDialog}><Ic.folderPlus /> New album</button>
          </div>

          <div className="alb-grid rise-2">
            {/* new album tile */}
            <button className="alb-new" onClick={openDialog}>
              <span className="alb-new-ic"><Ic.plus /></span>
              <span className="alb-new-t">New album</span>
              <span className="alb-new-s">Group videos by theme or goal</span>
            </button>

            {albums.map((a) => (
              <AlbumCard key={a.id} album={a}
                menuOpen={menuId === a.id}
                renaming={renameId === a.id}
                renameDraft={renameDraft}
                onMenu={() => toggleMenu(a.id)}
                onAction={(key) => handleAction(a.id, key)}
                onRenameChange={setRenameDraft}
                onRenameCommit={commitRename} />
            ))}
          </div>
        </div>
      </main>

      {creating && <NewAlbumModal onClose={closeDialog} onCreate={createAlbum} />}

      <TweaksPanel>
        <TweakSection label="New album" />
        <TweakRadio label="Dialog" value={creating ? 'open' : 'closed'}
          options={['open', 'closed']} onChange={(v) => setTweak('dialog', v)} />

        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
        <TweakToggle label="Collapse sidebar" value={collapsed}
          onChange={(v) => { setCollapsed(v); setTweak('collapsed', v); }} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
