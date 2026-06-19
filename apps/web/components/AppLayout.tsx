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
  children: React.ReactNode;
}

export function AppLayout({ account, reviewDue, activeKey, children }: AppLayoutProps) {
  const router = useRouter();

  const nav = buildAppNav({
    activeKey,
    reviewDue,
    onNavigate: (key) => router.push(key === "home" ? "/" : `/${key}`),
  });

  return (
    <AppShell nav={nav} account={account}>
      {children}
    </AppShell>
  );
}
