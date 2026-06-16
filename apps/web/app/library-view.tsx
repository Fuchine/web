"use client";

import { useRouter } from "next/navigation";
import { AppShell, VideoCard, Badge, Button, type NavItem } from "@fuchine/ui";

export type LibraryVideo = {
  id: string;
  title: string;
  channel: string | null;
  durationS: number | null;
  status: "pending" | "processing" | "done" | "failed";
  level: number | null;
  comprehension: number | null;
};

const I = {
  home: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  review: (<svg viewBox="0 0 24 24" fill="none"><path d="M20 11A8 8 0 1 0 18 16.5M20 5v6h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  settings: (<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>),
  dict: (<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zM7 4v14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  phrases: (<svg viewBox="0 0 24 24" fill="none"><path d="M7 8h10M7 12h6M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4 4V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
};

function duration(s: number | null): string | undefined {
  if (!s || s <= 0) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const STATUS: Record<string, { variant: "neutral" | "warning" | "error"; label: string } | null> = {
  done: null,
  pending: { variant: "neutral", label: "Queued" },
  processing: { variant: "warning", label: "Processing" },
  failed: { variant: "error", label: "Failed" },
};

export function LibraryView({
  videos,
  account,
  reviewDue,
}: {
  videos: LibraryVideo[];
  account: { name: string; sub?: string };
  reviewDue?: number;
}) {
  const router = useRouter();

  const nav: NavItem[] = [
    { key: "home", label: "Home", icon: I.home, active: true, onSelect: () => router.push("/") },
    { key: "review", label: "Review", icon: I.review, badge: reviewDue || undefined, onSelect: () => router.push("/review") },
    { key: "settings", label: "Settings", icon: I.settings, onSelect: () => router.push("/settings") },
    { key: "dictionary", label: "Dictionary", icon: I.dict, soon: true },
    { key: "phrases", label: "Phrases", icon: I.phrases, soon: true },
  ];

  return (
    <AppShell nav={nav} account={account}>
      <div className="px-8 py-9">
        <div className="mb-7 flex items-center gap-4">
          <h1 className="m-0 flex-1 text-[22px] font-[600] -tracking-[0.01em] text-fg">Videos</h1>
          <Button variant="ghost" size="sm" onClick={() => router.push("/import")}>Add video</Button>
        </div>

        {videos.length === 0 ? (
          <div className="mx-auto mt-20 max-w-[420px] text-center">
            <p className="mb-2 text-[17px] font-[550] text-fg">No videos yet</p>
            <p className="text-[14px] leading-[1.6] text-muted">
              Import a YouTube video with Japanese subtitles — from the browser extension or by pasting a link — to start studying.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-x-5 gap-y-7"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {videos.map((v) => {
              const status = STATUS[v.status];
              return (
                <div key={v.id}>
                  <VideoCard
                    title={v.title}
                    channel={v.channel ?? ""}
                    durationLabel={duration(v.durationS)}
                    level={v.level ?? undefined}
                    comprehension={v.comprehension ?? undefined}
                    onPlay={() => router.push(`/watch/${v.id}`)}
                  />
                  {status && (
                    <div className="mt-[10px]">
                      <Badge variant={status.variant} dot pill>{status.label}</Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
