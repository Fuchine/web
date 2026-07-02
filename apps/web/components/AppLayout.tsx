"use client";

import { useRouter } from "next/navigation";
import { AppShell, buildAppNav } from "@fuchine/ui";

export interface AppLayoutAccount {
  name: string;
  sub?: string;
  initials?: string;
}

export interface AppLayoutProps {
  account: AppLayoutAccount;
  reviewDue?: number;
  activeKey: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: React.ReactNode;
}

export function AppLayout({ account, reviewDue, activeKey, collapsed, onCollapsedChange, children }: AppLayoutProps) {
  const router = useRouter();

  const nav = buildAppNav({
    activeKey,
    reviewDue,
    onNavigate: (key) => {
      if (key === "home") router.push("/");
      else if (key === "library") router.push("/library");
      else if (key === "phrases") router.push("/phrases");
      else router.push(`/${key}`);
    },
  });

  return (
    <AppShell nav={nav} account={account} collapsed={collapsed} onCollapsedChange={onCollapsedChange}>
      {children}
    </AppShell>
  );
}
