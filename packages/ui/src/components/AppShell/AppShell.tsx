"use client";

import { type ReactNode, useState } from "react";
import { cn } from "../../lib/cn";
import { Avatar } from "../Avatar/Avatar";

export interface NavItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  /** Render faint + non-interactive with a "soon" tag (future features). */
  soon?: boolean;
  /** A trailing count/indicator, e.g. the Review due count. */
  badge?: ReactNode;
  href?: string;
  onSelect?: () => void;
}

export interface AppShellAccount {
  name: string;
  sub?: string;
  initials?: string;
}

export interface AppShellProps {
  nav: NavItem[];
  account?: AppShellAccount;
  brandKanji?: string;
  brandName?: string;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The Fuchine app shell: a collapsible left sidebar (淵 wordmark, nav, account
 * footer) + a scrolling content area. Active item highlighted in indigo.
 */
export function AppShell({
  nav,
  account,
  brandKanji = "淵",
  brandName = "Fuchine",
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  children,
}: AppShellProps) {
  const [internal, setInternal] = useState(defaultCollapsed);
  const collapsed = controlledCollapsed ?? internal;
  const toggle = () => {
    const next = !collapsed;
    onCollapsedChange?.(next);
    if (controlledCollapsed === undefined) setInternal(next);
  };

  const hideText = cn("transition-opacity duration-200", collapsed && "pointer-events-none opacity-0");

  return (
    <div
      className="grid h-full transition-[grid-template-columns] duration-300 ease-[var(--ease)]"
      style={{ gridTemplateColumns: collapsed ? "76px 1fr" : "252px 1fr" }}
    >
      <aside className="relative flex flex-col overflow-hidden border-r border-border bg-bg-2 px-[14px] pb-4 pt-[18px]">
        {/* brand row */}
        <div className="mb-[22px] flex h-10 items-center gap-[10px] px-[6px]">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-accent pb-px font-['Noto_Serif_JP',serif] text-[16px] leading-none text-on-accent">
            {brandKanji}
          </span>
          <span className={cn("whitespace-nowrap text-[16px] font-[600] -tracking-[0.01em] text-fg", hideText)}>
            {brandName}
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-faint transition-colors hover:bg-bg hover:text-fg"
          >
            <span className={cn("transition-transform duration-300", collapsed && "rotate-180")}>
              <Chevron />
            </span>
          </button>
        </div>

        {/* nav */}
        <nav className="flex flex-col gap-[3px]">
          {nav.map((item) => {
            const className = cn(
              "flex h-10 w-full items-center gap-3 rounded px-[11px] text-left text-[14px] font-medium transition-colors [&_svg]:h-[19px] [&_svg]:w-[19px] [&_svg]:flex-none",
              item.active
                ? "bg-accent text-on-accent"
                : item.soon
                  ? "cursor-default text-faint"
                  : "text-muted hover:bg-bg hover:text-fg",
            );
            const inner = (
              <>
                {item.icon}
                <span className={cn("flex-1 whitespace-nowrap", hideText)}>{item.label}</span>
                {item.badge != null && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-[7px] py-px text-[11px] font-[600] tabular-nums transition-opacity duration-200",
                      item.active ? "bg-on-accent/15 text-on-accent" : "bg-accent-soft-2 text-link",
                      collapsed && "opacity-0",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
                {item.soon && (
                  <span className={cn("ml-auto rounded-[5px] border border-border bg-bg px-[5px] py-[2px] text-[9.5px] font-[600] uppercase tracking-[0.04em] text-faint", hideText)}>
                    Soon
                  </span>
                )}
              </>
            );
            return item.href && !item.soon ? (
              <a key={item.key} href={item.href} className={className} aria-current={item.active ? "page" : undefined}>
                {inner}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                disabled={item.soon}
                onClick={item.onSelect}
                aria-current={item.active ? "page" : undefined}
                className={className}
              >
                {inner}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* account footer */}
        {account && (
          <div className="mt-2 border-t border-border pt-[14px]">
            <button
              type="button"
              className="flex w-full items-center gap-[11px] rounded px-2 py-[7px] text-left transition-colors hover:bg-bg"
            >
              <Avatar name={account.name} initials={account.initials} />
              <span className={cn("flex min-w-0 flex-col gap-px", hideText)}>
                <span className="truncate text-[13.5px] font-[550] text-fg">{account.name}</span>
                {account.sub && <span className="truncate text-[12px] text-muted">{account.sub}</span>}
              </span>
            </button>
          </div>
        )}
      </aside>

      <main className="overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  );
}
