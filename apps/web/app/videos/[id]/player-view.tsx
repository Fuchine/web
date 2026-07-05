"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Player, type PlayerProps } from "@fuchine/ui";
import type { Explanation } from "@fuchine/db";

export function PlayerView(props: Omit<PlayerProps, "onBack" | "onNavigate" | "onFetchChunk" | "onFetchExplanation" | "onSaveWord" | "onProgress">) {
  const router = useRouter();
  const videoId = props.video.id;

  const onProgress = useCallback((p: { msWatched: number; lineIds: string[] }) => {
    // keepalive lets the final flush survive tab close / navigation.
    fetch(`/api/videos/${videoId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
      keepalive: true,
    }).catch(() => {});
  }, [videoId]);

  const onFetchChunk = useCallback(
    async (chunkIdx: number) => {
      const res = await fetch(`/api/videos/${videoId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkIdx }),
      });
      if (!res.ok) throw new Error(`translate failed: ${res.status}`);
      const data = (await res.json()) as {
        lines?: { id: string; textTranslation: string | null }[];
      };
      return data.lines ?? [];
    },
    [videoId],
  );

  const onFetchExplanation = useCallback(
    async (lineId: string, opts?: { force?: boolean }) => {
      const res = await fetch(`/api/lines/${lineId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: opts?.force === true }),
      });
      if (!res.ok) throw new Error(`explain failed: ${res.status}`);
      const data = (await res.json()) as { explanation: Explanation };
      return data.explanation;
    },
    [],
  );

  const onSaveWord = useCallback(async (wordEntryId: string, save: boolean) => {
    const res = await fetch(`/api/dictionary/${wordEntryId}/saved`, { method: save ? "POST" : "DELETE" });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const data = (await res.json()) as { saved: boolean };
    return data.saved;
  }, []);

  return (
    <Player
      {...props}
      onFetchChunk={onFetchChunk}
      onFetchExplanation={onFetchExplanation}
      onSaveWord={onSaveWord}
      onProgress={onProgress}
      onBack={() => router.push("/")}
      onNavigate={(key) => router.push(key === "home" ? "/" : `/${key}`)}
    />
  );
}
