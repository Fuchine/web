import type { Meta, StoryObj } from "@storybook/react";
import { AppShell, type NavItem } from "./AppShell";
import { SectionHeading } from "../SectionHeading/SectionHeading";

const I = {
  home: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="4.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="3.5" y="14" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="14" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" /></svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M20 11A8 8 0 1 0 18 16.5M20 5v6h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  dict: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zM7 4v14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
};

const nav: NavItem[] = [
  { key: "home", label: "Home", icon: I.home, active: true },
  { key: "library", label: "Library", icon: I.library },
  { key: "review", label: "Review", icon: I.review, badge: 23 },
  { key: "settings", label: "Settings", icon: I.settings },
  { key: "dictionary", label: "Dictionary", icon: I.dict, soon: true },
];

function DemoContent() {
  return (
    <div style={{ padding: "36px 32px" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Good morning</h1>
      <p style={{ color: "var(--text-muted)", margin: "0 0 28px", fontSize: 14 }}>
        2h watched · 312 words · 5-day streak
      </p>
      <SectionHeading action={<a className="text-[13px] font-medium text-link" href="#">See all</a>}>
        Continue watching
      </SectionHeading>
      <div style={{ height: 120, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }} />
    </div>
  );
}

const meta: Meta<typeof AppShell> = {
  title: "Shell/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 580, overflow: "hidden", borderRadius: 12, border: "1px solid var(--border)" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { nav, account: { name: "Gabriel Soares", sub: "Free plan" }, children: <DemoContent /> },
};

export const Collapsed: Story = {
  args: { nav, account: { name: "Gabriel Soares", sub: "Free plan" }, collapsed: true, children: <DemoContent /> },
};
