import { type ReactNode } from "react";
import type { NavItem } from "./AppShell";

/** Canonical sidebar icons for the app shell — single source of truth. */
export const NAV_ICONS: Record<string, ReactNode> = {
  home: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  review: (<svg viewBox="0 0 24 24" fill="none"><path d="M20 11A8 8 0 1 0 18 16.5M20 5v6h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  settings: (<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>),
  dictionary: (<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zM7 4v14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  phrases: (<svg viewBox="0 0 24 24" fill="none"><path d="M7 8h10M7 12h6M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4 4V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  stats: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5h16M7 19.5v-7M12 19.5V6M17 19.5v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  albums: (<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><path d="M7.5 8.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 8 18z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  kana: (<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="3.4" stroke="currentColor" strokeWidth="1.7" /><path d="M8 9.6c1.8.2 4.6.2 6.4-.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M12.7 8.2c-.4 3.2-1.9 5.6-4.1 6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M12.6 11.8c1.6.9 2.7 2.1 2.7 3.2 0 .9-.6 1.4-1.5 1.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>),
};

export interface BuildAppNavOptions {
  /** Which route is highlighted: "home" | "review" | "kana" | "settings" | "dictionary" | "stats". */
  activeKey: string;
  /** Called with the item key when a live (non-soon) item is selected. */
  onNavigate: (key: string) => void;
  /** Review due count — rendered as a badge on the Review item. */
  reviewDue?: number;
}

/**
 * The canonical app-shell sidebar. Single source of truth for nav items,
 * icons, labels, and which features are still "soon". Both the app's router
 * pages (via AppLayout) and the Player build their nav from this — the Player
 * lives in the design system and can't use Next routing, so it supplies its
 * own callback-based onNavigate.
 */
export function buildAppNav({ activeKey, onNavigate, reviewDue }: BuildAppNavOptions): NavItem[] {
  return [
    { key: "home", label: "Home", icon: NAV_ICONS.home, active: activeKey === "home", onSelect: () => onNavigate("home") },
    { key: "review", label: "Review", icon: NAV_ICONS.review, badge: reviewDue || undefined, active: activeKey === "review", onSelect: () => onNavigate("review") },
    { key: "kana", label: "Kana", icon: NAV_ICONS.kana, active: activeKey === "kana", onSelect: () => onNavigate("kana") },
    { key: "settings", label: "Settings", icon: NAV_ICONS.settings, active: activeKey === "settings", onSelect: () => onNavigate("settings") },
    { key: "dictionary", label: "Dictionary", icon: NAV_ICONS.dictionary, active: activeKey === "dictionary", onSelect: () => onNavigate("dictionary") },
    { key: "stats", label: "Stats", icon: NAV_ICONS.stats, active: activeKey === "stats", onSelect: () => onNavigate("stats") },
    { key: "phrases", label: "Phrases", icon: NAV_ICONS.phrases, soon: true },
    { key: "albums", label: "Albums", icon: NAV_ICONS.albums, soon: true },
  ];
}
