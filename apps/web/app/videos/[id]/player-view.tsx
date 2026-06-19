"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Player, type PlayerProps } from "@fuchine/ui";

export function PlayerView(props: Omit<PlayerProps, "onBack" | "onNavigate" | "onFetchChunk">) {
  const router = useRouter();
  const videoId = props.video.id;

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

  return (
    <Player
      {...props}
      onFetchChunk={onFetchChunk}
      onBack={() => router.push("/")}
      onNavigate={(key) => router.push(key === "library" ? "/" : `/${key}`)}
    />
  );
}
