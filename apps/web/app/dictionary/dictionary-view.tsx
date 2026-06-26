"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrowseItem } from "@/app/api/dictionary/browse/route";
import type { CollectionItem } from "@/app/api/dictionary/collection/route";
import type { GrammarItem } from "@/app/api/dictionary/grammar/route";

type Item = BrowseItem | CollectionItem | GrammarItem;
type Kind = "vocabulary" | "grammar";

const FREQ_LABEL = ["", "Rare", "Uncommon", "Common", "Frequent", "Very common"];

const SKILLS = [
  { k: "read", label: "Reading" },
  { k: "listen", label: "Listening" },
  { k: "speak", label: "Speaking" },
  { k: "recall", label: "Recall" },
];

const STATUS_META: Record<string, { label: string }> = {
  known: { label: "Known" },
  learning: { label: "Learning" },
  new: { label: "New" },
};

const TYPES = [
  { v: "all", l: "All items" },
  { v: "new", l: "New" },
  { v: "learning", l: "Learning" },
  { v: "known", l: "Known" },
];

const POS_CHIPS: { label: string; key: string; tags: string[] }[] = [
  { label: "All", key: "", tags: [] },
  { label: "Verb", key: "verb", tags: ["v1", "v1-s", "vz", "v5aru", "v5b", "v5g", "v5k", "v5k-s", "v5m", "v5n", "v5r", "v5r-i", "v5s", "v5t", "v5u", "v5u-s", "v5uru", "vs", "vs-c", "vs-i", "vs-s", "vk", "vn", "vi", "vt", "v-unspec", "vr"] },
  { label: "Adjective", key: "adj", tags: ["adj-i", "adj-ix", "adj-na", "adj-no", "adj-f", "adj-pn", "adj-t", "adj-kari", "adj-ku", "adj-nari", "adj-shiku"] },
  { label: "Adverb", key: "adv", tags: ["adv", "adv-to"] },
  { label: "Noun", key: "noun", tags: ["n", "n-adv", "n-pref", "n-suf", "n-t", "pn", "num"] },
  { label: "Grammar", key: "grammar", tags: ["aux", "aux-adj", "aux-v", "conj", "cop", "prt", "pref", "suf", "ctr"] },
  { label: "Expression", key: "exp", tags: ["exp"] },
];

/* ---------- Icons ---------- */

const IcSearch = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5" /></svg>;
const IcClose = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
const IcBookmark = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z" /></svg>;
const IcBookmarkFill = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1z" /></svg>;
const IcVolume = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 9.5h3L11 6v12L7 14.5H4z" /><path d="M14.5 9.2a4 4 0 0 1 0 5.6" /></svg>;
const IcPlay = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5.5v13l11-6.5z" /></svg>;
const IcYoutube = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="3.5" /><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" /></svg>;
const IcCheck = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12.5 10 17.5 19 7" /></svg>;
const IcReview = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M20 7.5A8 8 0 1 0 21 12" /><path d="M20 4v3.5h-3.5" /></svg>;
const IcDict = (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" /><path d="M5 17.5h13" /></svg>;
/* ---------- Skeleton ---------- */

function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="voc-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={`skel-${i}`} className="voc-card voc-card-sk" style={{ "--idx": i } as React.CSSProperties}>
          <div className="vc-top">
            <span className="sk-badge" />
            <span className="sk-num" />
          </div>
          <div className="sk-word" />
          <div className="sk-romaji" />
          <div className="sk-pips">
            <span className="sk-pip" /><span className="sk-pip" /><span className="sk-pip" /><span className="sk-pip" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={`sk-row-${i}`} className="voc-card voc-card-sk" style={{ "--idx": i } as React.CSSProperties}>
          <div className="vc-top">
            <span className="sk-badge" />
            <span className="sk-num" />
          </div>
          <div className="sk-word" />
          <div className="sk-romaji" />
        </div>
      ))}
    </>
  );
}

/* ---------- Sub-components ---------- */

function FreqDots({ n }: { n: number }) {
  return (
    <span className="freq">
      <span className="dots">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < n ? "on" : ""} />)}</span>
      <span className="flabel">{FREQ_LABEL[n]}</span>
    </span>
  );
}

function MasteryPips({ m, show }: { m: number[]; show: boolean }) {
  if (!show) return null;
  return (
    <div className="vc-skills" aria-hidden="true">
      {SKILLS.map((s, i) => {
        const lv = m[i] ?? 0;
        const cls = lv >= 3 ? "full" : lv >= 1 ? "part" : "empty";
        return (
          <span key={s.k} className={"vc-pip " + cls} title={s.label}>
            {s.k === "read" ? <IcDict /> : s.k === "listen" ? <IcVolume /> : s.k === "speak" ? <IcReview /> : <IcCheck />}
          </span>
        );
      })}
    </div>
  );
}

type Example = {
  videoId: string;
  videoTitle: string | null;
  text: string;
  translation: string | null;
  startMs: number;
  lineId: string;
};

function Detail({
  item,
  kind,
  idx,
  saved,
  sources,
  onSave,
  onSetStatus,
  onClose,
}: {
  item: Item;
  kind: Kind;
  idx: number;
  saved: boolean;
  sources: Example[];
  onSave: () => void;
  onSetStatus: (s: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const total = item.m[0] + item.m[1] + item.m[2] + item.m[3];
  const pct = Math.round((total / 12) * 100);
  const display = "pat" in item ? item.pat : item.w;
  const status = (item as any).status || (total >= 10 ? "known" : total >= 1 ? "learning" : "new");

  return (
    <>
      <div className="voc-scrim" onClick={onClose} />
      <aside className="voc-detail" onClick={(e) => e.stopPropagation()}>
        <div className="vd-bar">
          <span className={"vd-status s-" + status}>{STATUS_META[status]?.label ?? status}</span>
          <span className="vd-spacer" />
          <button className="vd-x" onClick={onClose} title="Close"><IcClose /></button>
        </div>
        <div className="vd-scroll">
          <div className="vd-head">
            <div>
              <div className="vd-word jp">{display}</div>
              {"r" in item && item.r && <div className="vd-reading">{item.r}</div>}
            </div>
            <span className="vd-num">#{idx}</span>
          </div>

          <div className="vd-tags">
            {"pos" in item && item.pos && <span className="vd-pos">{item.pos}</span>}
            <FreqDots n={item.freq} />
          </div>

          <p className="vd-def">{item.def}</p>

          {/* status selector — mark New / Learning / Known */}
          <div className="vd-statusset">
            <div className="vd-sh">Your progress</div>
            <div className="vd-statusbtns" role="group" aria-label="Mark status">
              {(["new", "learning", "known"] as const).map((s) => (
                <button key={s} className={"vd-statusbtn s-" + s + (status === s ? " on" : "")} aria-pressed={status === s} onClick={() => onSetStatus(s)}>
                  <span className="vd-statusbtn-dot" />
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="vd-actions">
            <button className={"vd-save" + (saved ? " saved" : "")} onClick={onSave}>
              {saved ? <IcBookmarkFill /> : <IcBookmark />} {saved ? "Saved" : "Save word"}
            </button>
            <button className="vd-ghost" title="Hear pronunciation" onClick={() => {/* placeholder */}}><IcVolume /></button>
          </div>

          <div className="vd-section">
            <div className="vd-sh">Mastery <span className="vd-pct">{pct}%</span></div>
            <div className="vd-mastery">
              {SKILLS.map((s, i) => (
                <div key={s.k} className="vd-skill">
                  <span className="vd-skill-ic">
                    {s.k === "read" ? <IcDict /> : s.k === "listen" ? <IcVolume /> : s.k === "speak" ? <IcReview /> : <IcCheck />}
                  </span>
                  <span className="vd-skill-name">{s.label}</span>
                  <span className="vd-meter">
                    {[1, 2, 3].map((n) => <i key={n} className={n <= (item.m[i] ?? 0) ? "on" : ""} />)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="vd-section">
            <div className="vd-sh">Appears in your videos <span className="vd-count">{sources.length}</span></div>
            <div className="vd-sources">
              {sources.length === 0 ? (
                <div className="vd-no-sources">No video examples yet.</div>
              ) : (
                sources.map((sc, i) => (
                  <button key={i} className="vd-source" onClick={() => router.push(`/videos/${sc.videoId}?line=${sc.lineId}`)}>
                    <span className="vd-src-ic"><IcYoutube /></span>
                    <span className="vd-src-meta">
                      <span className="vd-src-title jp">{sc.text}</span>
                      <span className="vd-src-sub">{sc.videoTitle ?? "Video"} · {Math.floor(sc.startMs / 60000)}:{(sc.startMs / 1000 % 60).toFixed(0).padStart(2, "0")}</span>
                    </span>
                    <span className="vd-src-play"><IcPlay /></span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="vd-practice">
            <button className="vd-practice-btn" onClick={() => router.push("/review")}>
              <IcReview /> Practice now
            </button>
            <button className="vd-practice-btn ghost" onClick={() => router.push("/player")}>
              <IcPlay /> See in context
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ---------- Main View ---------- */

export function DictionaryView() {
  const router = useRouter();
  const [tab, setTab] = useState<Kind>("vocabulary");
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Browse mode (type === "all"): accumulated items with infinite scroll
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Collection mode (type !== "all"): items from collection/grammar API
  const [collectionItems, setCollectionItems] = useState<Item[]>([]);

  const [sel, setSel] = useState<string | null>(null);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());
  const [sources, setSources] = useState<Record<string, Example[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [showRomaji, setShowRomaji] = useState(true);
  const [showSkills, setShowSkills] = useState(true);
  const [posFilter, setPosFilter] = useState("");
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [totalCount, setTotalCount] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const debTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedQ, setDebouncedQ] = useState("");
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const nextCursorRef = useRef(nextCursor);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { nextCursorRef.current = nextCursor; }, [nextCursor]);

  const isBrowsing = type === "all";

  // Debounce search input
  useEffect(() => {
    if (debTimer.current) clearTimeout(debTimer.current);
    if (isBrowsing) {
      debTimer.current = setTimeout(() => setDebouncedQ(q), 300);
    } else {
      setDebouncedQ(q);
    }
    return () => { if (debTimer.current) clearTimeout(debTimer.current); };
  }, [q, isBrowsing]);

  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [toast]);

  // Fetch saved word IDs (used in both modes)
  useEffect(() => {
    fetch("/api/dictionary/saved")
      .then((r) => (r.ok ? r.json() : { ids: [] }))
      .then((d) => setSavedSet(new Set(d.ids ?? [])))
      .catch(() => {});
  }, []);

  // Reset when type changes
  useEffect(() => {
    setSel(null);
    setSources({});
    if (isBrowsing) {
      setBrowseItems([]);
      setNextCursor(null);
      setHasMore(true);
      setInitialLoading(true);
    } else {
      setCollectionItems([]);
      setInitialLoading(true);
    }
  }, [tab, type, isBrowsing]);

  // Fetch browse page (type === "all") — uses debouncedQ, stable ref
  const fetchBrowsePage = useCallback(async (cursor: string | null, searchTerm?: string) => {
    const id = ++reqId.current;
    const query = searchTerm ?? debouncedQ;
    setLoading(true);
    let hasMoreAfter = false;
    let nextCursorAfter: string | null = null;
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      if (tab === "grammar") params.set("grammar", "true");
      if (query.trim()) params.set("q", query.trim());
      if (posFilter) {
        const chip = POS_CHIPS.find((c) => c.key === posFilter);
        if (chip && chip.tags.length > 0) params.set("pos", chip.tags.join(","));
      }

      const res = await fetch(`/api/dictionary/browse?${params}`);
      if (id !== reqId.current) return;
      if (!res.ok) return;
      const data = await res.json() as { items: BrowseItem[]; nextCursor: string | null; hasMore: boolean; totalCount?: number };
      if (id !== reqId.current) return;
      setBrowseItems((prev) => cursor ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      if (!cursor && data.totalCount != null) setTotalCount(data.totalCount);
      hasMoreAfter = data.hasMore;
      nextCursorAfter = data.nextCursor;
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
    // Eagerly fill viewport: if sentinel is still visible after adding items,
    // load the next page (terminates when viewport is full or hasMore=false).
    if (id === reqId.current && hasMoreAfter && nextCursorAfter && sentinelRef.current) {
      const rect = sentinelRef.current.getBoundingClientRect();
      if (rect.top < window.innerHeight + 400) {
        fetchBrowsePage(nextCursorAfter);
      }
    }
  }, [tab, debouncedQ, posFilter]);

  // Fetch collection (type !== "all")
  useEffect(() => {
    if (isBrowsing) return;
    const endpoint = tab === "vocabulary" ? "/api/dictionary/collection" : "/api/dictionary/grammar";
    setInitialLoading(true);
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setCollectionItems(d.items ?? []))
      .catch(() => setCollectionItems([]))
      .finally(() => setInitialLoading(false));
  }, [tab, type, isBrowsing]);

  // Initial browse fetch + re-fetch on search/q change
  useEffect(() => {
    if (!isBrowsing) return;
    setBrowseItems([]);
    setNextCursor(null);
    setHasMore(true);
    setInitialLoading(true);
    fetchBrowsePage(null);
  }, [fetchBrowsePage, isBrowsing]);

  // Infinite scroll via IntersectionObserver
  // Refs prevent stale closure; observer stays connected across renders.
  useEffect(() => {
    if (!isBrowsing || !hasMoreRef.current || loadingRef.current || !sentinelRef.current) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      () => {
        if (hasMoreRef.current && !loadingRef.current) {
          fetchBrowsePage(nextCursorRef.current);
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isBrowsing, fetchBrowsePage, initialLoading]);

  const toggleSaved = useCallback(async (id: string) => {
    const was = savedSet.has(id);
    setSavedSet((prev) => {
      const next = new Set(prev);
      if (was) next.delete(id); else next.add(id);
      return next;
    });
    try {
      const res = await fetch(`/api/dictionary/${id}/saved`, { method: was ? "DELETE" : "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setToast(was ? "Removed from saved" : "Saved to your words");
    } catch {
      setSavedSet((prev) => {
        const next = new Set(prev);
        if (was) next.add(id); else next.delete(id);
        return next;
      });
    }
  }, [savedSet]);

  const select = useCallback(async (id: string) => {
    setSel(id);
    if (!sources[id]) {
      try {
        const res = await fetch(`/api/dictionary/${id}/examples`);
        if (res.ok) {
          const data = await res.json() as { examples: Example[] };
          setSources((prev) => ({ ...prev, [id]: data.examples ?? [] }));
        }
      } catch { /* ignore */ }
    }
  }, [sources]);

  // Items to display (raw)
  const displayItems = useMemo(() => {
    if (isBrowsing) return browseItems;
    return collectionItems;
  }, [isBrowsing, browseItems, collectionItems]);

  // Apply manual status overrides
  const source = useMemo(
    () => (displayItems as any[]).map((x: any) => statusMap[x.id] ? { ...x, status: statusMap[x.id] } : x),
    [displayItems, statusMap],
  );

  // Client-side filtering for collection mode
  const list = useMemo(() => {
    if (isBrowsing) return source;
    return (source as (CollectionItem | GrammarItem)[]).filter((x) => {
      if (type !== "all" && x.status !== type) return false;
      if (q) {
        const hay = ((("pat" in x ? x.pat : "") || ("w" in x ? x.w : "") || "").toLowerCase()) + (("r" in x ? x.r ?? "" : "").toLowerCase()) + x.def.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [isBrowsing, source, type, q]);

  // Counts for coverage: distribution from ALL current items (with status override)
  const coverageCounts = useMemo(() => {
    const c = { new: 0, learning: 0, known: 0 };
    source.forEach((x: any) => {
      const total = x.m[0] + x.m[1] + x.m[2] + x.m[3];
      const status = x.status || (total >= 10 ? "known" : total >= 1 ? "learning" : "new");
      c[status as keyof typeof c] += 1;
    });
    return c;
  }, [source]);

  const selItem = useMemo(() => {
    if (!sel) return null;
    return (source as any[]).find((x) => x.id === sel) ?? null;
  }, [sel, source]);

  const selIdx = selItem ? (source as any[]).indexOf(selItem) + 1 : 0;

  const setStatus = (id: string, s: string) => {
    setStatusMap((m) => ({ ...m, [id]: s }));
    setToast(s === "known" ? "Marked as known" : s === "learning" ? "Added to Learning" : "Marked as new");
  };

  return (
    <main className="vocab-main">
      {/* header */}
      <div className="voc-top">
        <div className="voc-tabs">
          <button className={"voc-tab" + (tab === "vocabulary" ? " on" : "")} onClick={() => { setTab("vocabulary"); setSel(null); setQ(""); }}>Vocabulary</button>
          <button className={"voc-tab" + (tab === "grammar" ? " on" : "")} onClick={() => { setTab("grammar"); setSel(null); setQ(""); }}>Grammar</button>
        </div>
        <div className="voc-top-right">
          <div className={"voc-search" + (searchOpen || q ? " open" : "")}>
            <button className="voc-search-ic" onClick={() => setSearchOpen((o) => !o)} title="Search"><IcSearch /></button>
            <input className="voc-search-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" onBlur={() => { if (!q) setSearchOpen(false); }} />
            {q && <button className="voc-search-x" onClick={() => setQ("")} title="Clear"><IcClose /></button>}
          </div>
          <div className="seg voc-typefilter">
            {TYPES.map((o) => (
              <button key={o.v} className={"seg-b" + (type === o.v ? " on" : "")} onClick={() => { setType(o.v); setSel(null); }}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* POS filter chips — only in browse mode */}
      {isBrowsing && (
        <div className="voc-pos-chips">
          {POS_CHIPS.map((c) => (
            <button key={c.key} className={"voc-pos-chip" + (posFilter === c.key ? " on" : "")} onClick={() => { setPosFilter(c.key); setSel(null); }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* coverage */}
      <div className="voc-coverage">
        <div className="cov-left">
          <span className="cov-title">Coverage analysis</span>
          <span className="cov-sub">{tab === "grammar" ? "Grammar points" : "Words"} you&apos;ve met across your videos</span>
        </div>
        <div className="cov-mid">
          <div className="cov-bar">
            {(["known", "learning", "new"] as const).map((s) => coverageCounts[s] > 0 && (
              <div key={s} className={"cov-seg s-" + s} style={{ flexGrow: coverageCounts[s] }} title={STATUS_META[s].label + " · " + coverageCounts[s]}>
                <span className="cov-seg-lab">{STATUS_META[s].label} · {coverageCounts[s]}</span>
              </div>
            ))}
          </div>
          <div className="cov-legend">
            {(["known", "learning", "new"] as const).map((s) => (
              <span key={s} className="cov-leg"><i className={"s-" + s} />{STATUS_META[s].label}<b>{coverageCounts[s]}</b></span>
            ))}
          </div>
        </div>
        <div className="cov-right">
          <div className="cov-total"><b>{source.length}</b> {totalCount > 0 && <span>/ {totalCount.toLocaleString()}</span>}</div>
          <div className="cov-total-lab">Total coverage{totalCount > 0 ? ` · ${(source.length / totalCount * 100).toFixed(1)}%` : ""}</div>
        </div>
      </div>

      {/* grid */}
      <div className="voc-scroll">
        {initialLoading ? (
          <SkeletonGrid count={12} />
        ) : list.length === 0 && !loading ? (
          <div className="voc-none">No {tab === "grammar" ? "grammar points" : "words"} match this filter.</div>
        ) : (
            <div className="voc-grid">
              {(list as any[]).map((x: any, _i: number) => {
                const i = (source as any[]).indexOf(x) + 1;
                const display = x.pat ?? x.w ?? "";
                const reading = x.r ?? null;
                const total = x.m[0] + x.m[1] + x.m[2] + x.m[3];
                const status = x.status || (total >= 10 ? "known" : total >= 1 ? "learning" : "new");
                const isSaved = "saved" in x ? x.saved : savedSet.has(x.id);
              return (
                <button key={x.id} className={"voc-card s-" + status + (sel === x.id ? " on" : "")} style={{"--idx": i} as React.CSSProperties} onClick={() => void select(x.id)}>
                  <div className="vc-top">
                    <span className="vc-badge">{STATUS_META[status]?.label ?? "New"}</span>
                    <span className="vc-num">#{i}</span>
                  </div>
                  <div className="vc-word jp">{display}</div>
                  {showRomaji && reading && <div className="vc-romaji">{reading}</div>}
                  {isBrowsing && !isSaved && x.def && <div className="vc-gloss">{x.def}</div>}
                  {isSaved && <MasteryPips m={x.m} show={showSkills} />}
                </button>
              );
            })}
            {/* sentinel + loading indicator for infinite scroll */}
            {isBrowsing && <div ref={sentinelRef} className="voc-sentinel" />}
            {isBrowsing && loading && <SkeletonRow count={4} />}
          </div>
        )}
      </div>

      {/* detail slide-over */}
      {selItem && (
        <Detail
          item={selItem as Item}
          kind={tab}
          idx={selIdx}
          saved={savedSet.has(selItem.id)}
          sources={sources[selItem.id] ?? []}
          onSave={() => void toggleSaved(selItem.id)}
          onSetStatus={(s) => setStatus(selItem.id, s)}
          onClose={() => setSel(null)}
        />
      )}

      {/* toast */}
      {toast && (
        <div className="dict-toast"><IcCheck /> {toast}</div>
      )}
    </main>
  );
}
