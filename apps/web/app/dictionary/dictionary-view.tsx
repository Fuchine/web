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
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`skel-${i}`}
          className="relative flex flex-col border border-border rounded-[var(--radius)] bg-surface p-[11px_13px_10px] min-h-[138px] pointer-events-none overflow-hidden
            after:content-[''] after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.25)_50%,transparent_100%)] dark:after:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.06)_50%,transparent_100%)] after:animate-[dict-sk-shimmer_1.4s_ease-in-out_infinite]"
          style={{ "--idx": i } as React.CSSProperties}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="block w-[42px] h-3 rounded-[3px] bg-border" />
            <span className="block w-[26px] h-3 rounded-[3px] bg-border" />
          </div>
          <div className="w-[70%] h-7 mt-[14px] rounded-[5px] bg-border-strong" />
          <div className="w-[45%] h-3 mt-[7px] rounded-[3px] bg-border" />
          <div className="flex gap-[5px] mt-auto pt-3">
            <span className="w-[22px] h-[22px] rounded-[6px] bg-border" />
            <span className="w-[22px] h-[22px] rounded-[6px] bg-border" />
            <span className="w-[22px] h-[22px] rounded-[6px] bg-border" />
            <span className="w-[22px] h-[22px] rounded-[6px] bg-border" />
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
        <div
          key={`sk-row-${i}`}
          className="relative flex flex-col border border-border rounded-[var(--radius)] bg-surface p-[11px_13px_10px] min-h-[138px] pointer-events-none overflow-hidden
            after:content-[''] after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.25)_50%,transparent_100%)] dark:after:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.06)_50%,transparent_100%)] after:animate-[dict-sk-shimmer_1.4s_ease-in-out_infinite]"
          style={{ "--idx": i } as React.CSSProperties}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="block w-[42px] h-3 rounded-[3px] bg-border" />
            <span className="block w-[26px] h-3 rounded-[3px] bg-border" />
          </div>
          <div className="w-[70%] h-7 mt-[14px] rounded-[5px] bg-border-strong" />
          <div className="w-[45%] h-3 mt-[7px] rounded-[3px] bg-border" />
        </div>
      ))}
    </>
  );
}

/* ---------- Sub-components ---------- */

function FreqDots({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className="inline-flex gap-[2.5px]">
        {Array.from({ length: 5 }, (_, i) => (
          <i
            key={i}
            className={`w-[5px] h-[5px] rounded-full not-italic ${i < n ? "bg-link" : "bg-border-strong"}`}
          />
        ))}
      </span>
      <span className="text-[11.5px] text-muted">{FREQ_LABEL[n]}</span>
    </span>
  );
}

// Pip color classes derived directly from status prop (no parent-class dependency)
const PIP_FULL_CLASSES: Record<string, string> = {
  known: "text-ok bg-ok-soft border-[color-mix(in_oklch,var(--ok)_30%,transparent)]",
  learning: "text-[oklch(0.50_0.10_70)] bg-[oklch(0.62_0.10_70/0.16)] border-[oklch(0.62_0.10_70/0.34)] dark:text-[oklch(0.80_0.10_70)]",
  new: "text-link bg-accent-soft-2 border-accent-line",
};

function MasteryPips({ m, show, status }: { m: number[]; show: boolean; status: string }) {
  if (!show) return null;
  return (
    <div className="flex gap-[5px] mt-auto pt-3" aria-hidden="true">
      {SKILLS.map((s, i) => {
        const lv = m[i] ?? 0;
        const levelKey = lv >= 3 ? "full" : lv >= 1 ? "part" : "empty";
        const baseClasses = "w-[22px] h-[22px] rounded-[6px] grid place-items-center border border-border bg-bg-2 text-faint [&_svg]:w-3 [&_svg]:h-3";
        const stateClasses =
          levelKey === "empty"
            ? "opacity-55"
            : levelKey === "part"
            ? "text-muted bg-surface border-border-strong"
            : PIP_FULL_CLASSES[status] ?? "";
        return (
          <span key={s.k} className={`${baseClasses} ${stateClasses}`} title={s.label}>
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

// Status badge color classes for Detail panel and card
const STATUS_BADGE_CLASSES: Record<string, string> = {
  known: "text-ok bg-ok-soft",
  learning: "text-[oklch(0.50_0.10_70)] bg-[oklch(0.62_0.10_70/0.14)] dark:text-[oklch(0.80_0.10_70)]",
  new: "text-link bg-accent-soft-2",
};

// Status button active state color classes
const STATUS_BTN_ON_CLASSES: Record<string, string> = {
  known: "bg-ok-soft border-[color-mix(in_oklch,var(--ok)_40%,transparent)] text-ok",
  learning: "bg-[oklch(0.62_0.10_70/0.14)] border-[oklch(0.62_0.10_70/0.40)] text-[oklch(0.50_0.10_70)] dark:text-[oklch(0.80_0.10_70)]",
  new: "bg-accent-soft-2 border-accent-line text-link",
};

// Status button dot color classes
const STATUS_BTN_DOT_CLASSES: Record<string, string> = {
  known: "bg-ok",
  learning: "bg-[oklch(0.62_0.10_70)]",
  new: "bg-link",
};

// Card background/border per status
const CARD_STATUS_CLASSES: Record<string, string> = {
  known: "[background:color-mix(in_oklch,var(--ok-soft)_55%,var(--surface))] border-[color-mix(in_oklch,var(--ok)_24%,var(--border))]",
  learning: "bg-[oklch(0.62_0.10_70/0.07)] border-[oklch(0.62_0.10_70/0.30)]",
  new: "bg-surface border-border",
};

// Card left rail color
const CARD_RAIL_CLASSES: Record<string, string> = {
  known: "bg-ok",
  learning: "bg-[oklch(0.62_0.10_70)]",
  new: "bg-border-strong",
};

// Card badge text color
const CARD_BADGE_CLASSES: Record<string, string> = {
  known: "text-ok",
  learning: "text-[oklch(0.50_0.10_70)] dark:text-[oklch(0.78_0.10_70)]",
  new: "text-faint",
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
      {/* Scrim */}
      <div
        className="fixed inset-0 z-[60] bg-[rgba(20,16,10,0.30)] motion-safe:animate-[dict-scrim-in_0.2s_var(--ease)]"
        onClick={onClose}
      />
      {/* Detail panel */}
      <aside
        className="fixed z-[61] top-0 right-0 bottom-0 w-[min(420px,92vw)] bg-surface border-l border-border shadow-[var(--shadow-lg)] flex flex-col motion-safe:animate-[dict-detail-in_0.26s_var(--ease)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center gap-[10px] px-4 py-[14px] border-b border-border flex-none">
          <span
            className={`text-[10.5px] font-bold tracking-[0.06em] uppercase rounded-[6px] px-[9px] py-1 ${STATUS_BADGE_CLASSES[status] ?? ""}`}
          >
            {STATUS_META[status]?.label ?? status}
          </span>
          <span className="flex-1" />
          <button
            className="w-8 h-8 border-none bg-transparent rounded-[8px] text-faint cursor-pointer grid place-items-center transition-[background,color] duration-150 hover:bg-bg-2 hover:text-fg [&_svg]:w-4 [&_svg]:h-4"
            onClick={onClose}
            title="Close"
          >
            <IcClose />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-[22px] py-[22px] pb-7">
          {/* Head: word + number */}
          <div className="flex items-start justify-between gap-[14px]">
            <div>
              <div
                className="text-[42px] font-semibold leading-[1.1] text-fg tracking-[0.01em]"
                style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
              >
                {display}
              </div>
              {"r" in item && item.r && (
                <div className="text-[15px] text-muted mt-[5px] tracking-[0.04em]">{item.r}</div>
              )}
            </div>
            <span className="text-[13px] font-semibold text-faint tabular-nums pt-[6px]">#{idx}</span>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-[10px] mt-4 flex-wrap">
            {"pos" in item && item.pos && (
              <span className="text-[12px] font-[550] text-link bg-accent-soft-2 rounded-[6px] px-[10px] py-1">
                {item.pos}
              </span>
            )}
            <FreqDots n={item.freq} />
          </div>

          {/* Definition */}
          <p className="text-base leading-[1.55] text-fg mt-4 [text-wrap:pretty]">{item.def}</p>

          {/* Status selector */}
          <div className="mt-5">
            <div className="text-[12px] font-semibold tracking-[0.04em] uppercase text-muted mb-[13px] flex items-center gap-[9px]">
              Your progress
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Mark status">
              {(["new", "learning", "known"] as const).map((s) => {
                const isOn = status === s;
                return (
                  <button
                    key={s}
                    className={`inline-flex items-center justify-center gap-[7px] h-[42px] rounded-[10px] cursor-pointer border font-[inherit] text-[13px] font-[550] transition-[border-color,background,color] duration-150 ease-[var(--ease)]
                      ${isOn ? STATUS_BTN_ON_CLASSES[s] : "border-border-strong bg-surface text-muted hover:border-faint hover:text-fg"}`}
                    aria-pressed={isOn}
                    onClick={() => onSetStatus(s)}
                  >
                    <span
                      className={`w-[9px] h-[9px] rounded-full transition-[background] duration-150 ease-[var(--ease)] ${isOn ? STATUS_BTN_DOT_CLASSES[s] : "bg-border-strong"}`}
                    />
                    {STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-[18px]">
            <button
              className={`flex-1 inline-flex items-center justify-center gap-[7px] h-10 border rounded-[10px] font-[inherit] text-[13px] font-[550] cursor-pointer transition-[border-color,background,color] duration-150 [&_svg]:w-4 [&_svg]:h-4
                ${saved
                  ? "text-link bg-accent-soft-2 border-accent-line"
                  : "border-border-strong bg-surface text-fg hover:border-faint"
                }`}
              onClick={onSave}
            >
              {saved ? <IcBookmarkFill /> : <IcBookmark />} {saved ? "Saved" : "Save word"}
            </button>
            <button
              className="w-10 h-10 flex-none border border-border-strong bg-surface rounded-[10px] text-muted cursor-pointer grid place-items-center transition-[border-color,color] duration-150 hover:text-fg hover:border-faint [&_svg]:w-[18px] [&_svg]:h-[18px]"
              title="Hear pronunciation"
              onClick={() => {/* placeholder */}}
            >
              <IcVolume />
            </button>
          </div>

          {/* Mastery section */}
          <div className="mt-[26px]">
            <div className="text-[12px] font-semibold tracking-[0.04em] uppercase text-muted mb-[13px] flex items-center gap-[9px]">
              Mastery{" "}
              <span className="text-[11px] font-semibold text-link bg-accent-soft-2 rounded-full px-2 py-px tracking-normal normal-case">
                {pct}%
              </span>
            </div>
            <div className="flex flex-col gap-[9px]">
              {SKILLS.map((s, i) => (
                <div key={s.k} className="flex items-center gap-[11px]">
                  <span className="w-[30px] h-[30px] flex-none rounded-[8px] bg-bg-2 border border-border text-muted grid place-items-center [&_svg]:w-4 [&_svg]:h-4">
                    {s.k === "read" ? <IcDict /> : s.k === "listen" ? <IcVolume /> : s.k === "speak" ? <IcReview /> : <IcCheck />}
                  </span>
                  <span className="text-[13.5px] text-fg flex-1">{s.label}</span>
                  <span className="inline-flex gap-1">
                    {[1, 2, 3].map((n) => (
                      <i
                        key={n}
                        className={`w-5 h-[6px] rounded-[3px] not-italic border ${
                          n <= (item.m[i] ?? 0)
                            ? "bg-accent border-accent"
                            : "bg-bg-2 border-border"
                        }`}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sources section */}
          <div className="mt-[26px]">
            <div className="text-[12px] font-semibold tracking-[0.04em] uppercase text-muted mb-[13px] flex items-center gap-[9px]">
              Appears in your videos{" "}
              <span className="text-[11px] font-semibold text-link bg-accent-soft-2 rounded-full px-2 py-px tracking-normal normal-case">
                {sources.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {sources.length === 0 ? (
                <div className="text-[13px] text-muted py-2">No video examples yet.</div>
              ) : (
                sources.map((sc, i) => (
                  <button
                    key={i}
                    className="flex items-center gap-[11px] border border-border rounded-[var(--radius)] px-3 py-[10px] bg-[var(--field-bg-2)] transition-[border-color,background] duration-150 cursor-pointer font-[inherit] text-left w-full hover:border-border-strong hover:bg-surface"
                    onClick={() => router.push(`/videos/${sc.videoId}?line=${sc.lineId}`)}
                  >
                    <span className="w-[30px] h-[30px] flex-none rounded-[8px] bg-bg-2 text-muted grid place-items-center [&_svg]:w-[17px] [&_svg]:h-[17px]">
                      <IcYoutube />
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span
                        className="text-[13px] font-[550] text-fg whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
                      >
                        {sc.text}
                      </span>
                      <span className="text-[11.5px] text-faint whitespace-nowrap overflow-hidden text-ellipsis">
                        {sc.videoTitle ?? "Video"} · {Math.floor(sc.startMs / 60000)}:{(sc.startMs / 1000 % 60).toFixed(0).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="w-[26px] h-[26px] flex-none rounded-full bg-accent text-on-accent grid place-items-center [&_svg]:w-[11px] [&_svg]:h-[11px]">
                      <IcPlay />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Practice buttons */}
          <div className="flex gap-2 mt-[26px]">
            <button
              className="flex-1 inline-flex items-center justify-center gap-[7px] h-[42px] rounded-[10px] border border-accent bg-accent font-[inherit] text-[13px] font-semibold text-on-accent cursor-pointer transition-[background,border-color,color] duration-150 hover:bg-accent-hover [&_svg]:w-4 [&_svg]:h-4"
              onClick={() => router.push("/review")}
            >
              <IcReview /> Practice now
            </button>
            <button
              className="flex-1 inline-flex items-center justify-center gap-[7px] h-[42px] rounded-[10px] border border-border-strong bg-surface font-[inherit] text-[13px] font-semibold text-fg cursor-pointer transition-[background,border-color,color] duration-150 hover:border-faint hover:bg-bg-2 [&_svg]:w-4 [&_svg]:h-4"
              onClick={() => router.push("/player")}
            >
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

  // Coverage segment colors (inline because of oklch values not mappable to Tailwind tokens)
  const COV_SEG_CLASSES: Record<string, string> = {
    known: "bg-ok-soft text-ok",
    learning: "bg-[oklch(0.62_0.10_70/0.15)] text-[oklch(0.46_0.10_70)] dark:text-[oklch(0.78_0.10_70)]",
    new: "bg-accent-soft-2 text-link",
  };

  const COV_LEG_DOT_CLASSES: Record<string, string> = {
    known: "bg-ok",
    learning: "bg-[oklch(0.62_0.10_70)]",
    new: "bg-link",
  };

  return (
    <main className="flex flex-col overflow-hidden min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center gap-5 px-[30px] pt-4 flex-none max-sm:px-4 max-sm:pt-[14px] max-sm:gap-3 max-sm:flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 flex-none">
          {(["vocabulary", "grammar"] as const).map((t) => (
            <button
              key={t}
              className={`relative border-none bg-transparent font-[inherit] text-[21px] font-semibold tracking-[-0.01em] cursor-pointer px-0.5 pb-[14px] pt-[6px] transition-colors duration-150 ease-[var(--ease)]
                ${tab === t
                  ? "text-fg after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-[2.5px] after:rounded-[2px] after:bg-accent"
                  : "text-faint hover:text-muted"
                }`}
              onClick={() => { setTab(t); setSel(null); setQ(""); }}
            >
              {t === "vocabulary" ? "Vocabulary" : "Grammar"}
            </button>
          ))}
        </div>

        {/* Right side: search + type filter */}
        <div className="ml-auto flex items-center gap-[10px] flex-none max-sm:w-full">
          {/* Search field — collapses to icon when closed */}
          <div
            className={`flex items-center h-[38px] border border-border-strong rounded-[10px] bg-[var(--field-bg)] overflow-hidden transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-ring)]`}
          >
            <button
              className="w-[38px] h-[38px] flex-none border-none bg-transparent text-faint cursor-pointer grid place-items-center hover:text-fg [&_svg]:w-[17px] [&_svg]:h-[17px]"
              onClick={() => setSearchOpen((o) => !o)}
              title="Search"
            >
              <IcSearch />
            </button>
            <input
              className={`border-none bg-transparent outline-none font-[inherit] text-[14px] text-fg p-0 placeholder:text-faint transition-[width,padding] duration-[220ms] ease-[var(--ease)]
                ${searchOpen || q ? "w-[168px] pr-[6px]" : "w-0"}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              onBlur={() => { if (!q) setSearchOpen(false); }}
            />
            {q && (
              <button
                className="w-7 h-[38px] flex-none border-none bg-transparent text-faint cursor-pointer grid place-items-center hover:text-fg [&_svg]:w-[14px] [&_svg]:h-[14px]"
                onClick={() => setQ("")}
                title="Clear"
              >
                <IcClose />
              </button>
            )}
          </div>

          {/* Segmented type filter */}
          <div className="inline-flex bg-bg-2 border border-border rounded-[9px] p-[3px] gap-[2px] max-sm:flex-1 max-sm:overflow-x-auto">
            {TYPES.map((o) => (
              <button
                key={o.v}
                className={`border-none font-[inherit] text-[12.5px] font-[550] px-3 py-[6px] rounded-[7px] cursor-pointer whitespace-nowrap transition-[background,color] duration-[140ms] ease-[var(--ease)]
                  ${type === o.v
                    ? "bg-surface text-fg shadow-[var(--shadow-sm)]"
                    : "bg-transparent text-muted hover:text-fg"
                  }`}
                onClick={() => { setType(o.v); setSel(null); }}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* POS filter chips — only in browse mode */}
      {isBrowsing && (
        <div className="flex gap-[6px] px-[30px] flex-wrap mt-6 max-sm:px-4">
          {POS_CHIPS.map((c) => (
            <button
              key={c.key}
              className={`text-[12px] font-[500] h-[26px] px-[10px] rounded-[13px] border cursor-pointer transition-[background,color,border-color] duration-150
                ${posFilter === c.key
                  ? "bg-accent text-on-accent border-accent"
                  : "border-border bg-bg text-muted hover:bg-bg-2 hover:text-fg"
                }`}
              onClick={() => { setPosFilter(c.key); setSel(null); }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Coverage analysis */}
      <div className="flex items-center gap-7 px-[18px] py-[18px] mx-[30px] mt-[14px] border border-border rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-sm)] flex-none
        max-[920px]:flex-wrap max-[920px]:gap-y-4 max-sm:mx-4 max-sm:mt-3 max-sm:px-4 max-sm:py-[14px]">
        {/* Left label */}
        <div className="flex-none min-w-[150px]">
          <span className="block text-[14px] font-semibold text-fg tracking-[-0.005em]">Coverage analysis</span>
          <span className="block text-[12px] text-muted mt-[3px]">
            {tab === "grammar" ? "Grammar points" : "Words"} you&apos;ve met across your videos
          </span>
        </div>

        {/* Bar + legend */}
        <div className="flex-1 min-w-0 max-[920px]:order-3 max-[920px]:basis-full">
          <div className="flex gap-[3px] h-[26px] rounded-[8px] overflow-hidden">
            {(["known", "learning", "new"] as const).map((s) =>
              coverageCounts[s] > 0 && (
                <div
                  key={s}
                  className={`flex items-center px-[10px] min-w-0 text-[11.5px] font-semibold tracking-[0.01em] whitespace-nowrap transition-[flex-grow] duration-300 ease-[var(--ease)] ${COV_SEG_CLASSES[s]}`}
                  style={{ flexGrow: coverageCounts[s] }}
                  title={STATUS_META[s].label + " · " + coverageCounts[s]}
                >
                  <span className="overflow-hidden text-ellipsis">{STATUS_META[s].label} · {coverageCounts[s]}</span>
                </div>
              )
            )}
          </div>
          <div className="flex gap-4 mt-[9px]">
            {(["known", "learning", "new"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-[6px] text-[12px] text-muted">
                <i className={`w-[9px] h-[9px] rounded-[3px] not-italic ${COV_LEG_DOT_CLASSES[s]}`} />
                {STATUS_META[s].label}
                <b className="text-fg font-semibold tabular-nums">{coverageCounts[s]}</b>
              </span>
            ))}
          </div>
        </div>

        {/* Right: total */}
        <div className="flex-none text-right max-sm:text-left">
          <div className="text-[20px] font-semibold text-fg tabular-nums">
            <b>{source.length}</b>
            {totalCount > 0 && <span className="text-faint font-[500] text-[14px]"> / {totalCount.toLocaleString()}</span>}
          </div>
          <div className="text-[11.5px] text-muted mt-[2px]">
            Total coverage{totalCount > 0 ? ` · ${(source.length / totalCount * 100).toFixed(1)}%` : ""}
          </div>
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-[30px] py-[22px] pb-10 min-h-0 max-sm:px-4 max-sm:py-4 max-sm:pb-8">
        {initialLoading ? (
          <SkeletonGrid count={12} />
        ) : list.length === 0 && !loading ? (
          <div className="pt-10 pb-10 px-1 text-muted text-[14px]">
            No {tab === "grammar" ? "grammar points" : "words"} match this filter.
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] max-sm:[grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]">
            {(list as any[]).map((x: any, i: number) => {
              const idx = i + 1;
              const display = x.pat ?? x.w ?? "";
              const reading = x.r ?? null;
              const total = x.m[0] + x.m[1] + x.m[2] + x.m[3];
              const status = x.status || (total >= 10 ? "known" : total >= 1 ? "learning" : "new");
              const isSaved = "saved" in x ? x.saved : savedSet.has(x.id);
              return (
                <button
                  key={x.id}
                  className={`relative text-left cursor-pointer font-[inherit] flex flex-col border rounded-[var(--radius)] p-[11px_13px_10px] min-h-[138px]
                    transition-[transform,box-shadow,border-color] duration-[140ms] ease-[var(--ease)]
                    motion-safe:animate-[dict-card-pop_0.3s_var(--ease)_both]
                    hover:-translate-y-0.5 hover:shadow-[var(--shadow)]
                    before:content-[''] before:absolute before:left-0 before:top-[10px] before:bottom-[10px] before:w-[3px] before:rounded-[0_2px_2px_0]
                    ${CARD_STATUS_CLASSES[status] ?? ""}
                    ${sel === x.id ? "shadow-[0_0_0_2px_var(--accent-ring),var(--shadow)]" : ""}
                    before:${CARD_RAIL_CLASSES[status] ?? ""}`}
                  style={{ "--idx": idx } as React.CSSProperties}
                  onClick={() => void select(x.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[9.5px] font-bold tracking-[0.06em] uppercase ${CARD_BADGE_CLASSES[status] ?? ""}`}>
                      {STATUS_META[status]?.label ?? "New"}
                    </span>
                    <span className="text-[11px] font-semibold text-faint tabular-nums">#{idx}</span>
                  </div>
                  <div
                    className="text-[30px] font-[500] leading-[1.2] text-fg mt-3 tracking-[0.01em]"
                    style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
                  >
                    {display}
                  </div>
                  {showRomaji && reading && (
                    <div className="text-[12.5px] text-muted mt-[3px] tracking-[0.02em]">{reading}</div>
                  )}
                  {isBrowsing && !isSaved && x.def && (
                    <div className="text-[11.5px] text-muted mt-[6px] leading-[1.4] [-webkit-line-clamp:2] [display:-webkit-box] [-webkit-box-orient:vertical] overflow-hidden">
                      {x.def}
                    </div>
                  )}
                  {isSaved && <MasteryPips m={x.m} show={showSkills} status={status} />}
                </button>
              );
            })}
            {/* sentinel + loading indicator for infinite scroll */}
            {isBrowsing && <div ref={sentinelRef} className="h-px" />}
            {isBrowsing && loading && <SkeletonRow count={4} />}
          </div>
        )}
      </div>

      {/* Detail slide-over */}
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

      {/* Toast */}
      {toast && (
        <div className="fixed z-[90] left-1/2 bottom-[26px] -translate-x-1/2 inline-flex items-center gap-[10px] px-[18px] py-3 rounded-full bg-fg text-surface text-[13.5px] font-[550] shadow-[var(--shadow-lg)] motion-safe:animate-[dict-toast-in_0.22s_var(--ease)] [&_svg]:w-4 [&_svg]:h-4">
          <IcCheck /> {toast}
        </div>
      )}
    </main>
  );
}
