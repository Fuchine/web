"use client";

import { useRouter } from "next/navigation";
import { VideoCard, Badge, Button } from "@fuchine/ui";
import { AppLayout } from "@/components/AppLayout";

export type LibraryVideo = {
  id: string;
  title: string;
  channel: string | null;
  source: string;
  sourceId: string;
  durationS: number | null;
  status: "pending" | "processing" | "done" | "failed";
  level: number | null;
  comprehension: number | null;
};

function youtubeThumbnail(sourceId: string) {
  return `https://img.youtube.com/vi/${sourceId}/mqdefault.jpg`;
}

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

  return (
    <AppLayout account={account} reviewDue={reviewDue} activeKey="home">
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
                    thumbnailUrl={v.source === "youtube" ? youtubeThumbnail(v.sourceId) : undefined}
                    onPlay={() => router.push(`/videos/${v.id}`)}
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
    </AppLayout>
  );
}
