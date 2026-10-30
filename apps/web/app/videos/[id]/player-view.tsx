"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Player, UserFacingError, type PlayerProps } from "@fuchine/ui";
import type { Explanation } from "@fuchine/db";
import { hiraToRomaji } from "@fuchine/nlp/client";
import { resetLineTokens, saveLineTokens, searchEntries, type LineTokensResponse } from "@/lib/token-fix-client";

// The player renders romaji from the token; corrected tokens may lack it.
const toPlayerTokens = (r: LineTokensResponse) => ({
  tokens: r.tokens.map((t) => ({ ...t, romaji: t.romaji ?? (t.reading ? hiraToRomaji(t.reading) : null) })),
  tokenSpans: r.tokenSpans,
});

export function PlayerView(props: Omit<PlayerProps, "onBack" | "onNavigate" | "onFetchChunk" | "onFetchExplanation" | "explanationPromptVersion" | "onSaveWord" | "onMarkUnknown" | "onProgress" | "onSaveTokens" | "onResetTokens" | "onSearchEntries">) {
  const router = useRouter();
  const videoId = props.video.id;
  // Prompt version the server reports with each explanation (T3.12 label).
  const [promptVersion, setPromptVersion] = useState<number | null>(null);

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
      // 202 = another request is already translating this chunk (server-side
      // claim). Retry a few times so we land on the freshly-cached result rather
      // than falsely marking the chunk done with no translations. If it's still
      // pending after the budget, throw so the chunk stays retryable.
      const MAX_PENDING_RETRIES = 5;
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(`/api/videos/${videoId}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunkIdx }),
        });
        if (res.status === 202) {
          if (attempt >= MAX_PENDING_RETRIES) throw new Error("translate still pending");
          const retryAfter = Number(res.headers.get("Retry-After")) || 2;
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        if (!res.ok) throw new Error(`translate failed: ${res.status}`);
        const data = (await res.json()) as {
          lines?: { id: string; textTranslation: string | null }[];
        };
        return data.lines ?? [];
      }
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
      if (!res.ok) {
        // Instance-wide refusals (daily house budget spent, no BYOK key) carry
        // a message meant for the user; anything else stays generic.
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if ((body.code === "house_budget" || body.code === "byok_required") && body.error) {
          throw new UserFacingError(body.error, true);
        }
        throw new Error(`explain failed: ${res.status}`);
      }
      const data = (await res.json()) as { explanation: Explanation; promptVersion?: number };
      if (typeof data.promptVersion === "number") setPromptVersion(data.promptVersion);
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

  // "Mark as unknown" = the manual override "new" (T3.9); undo clears it.
  const onMarkUnknown = useCallback(async (wordEntryId: string, unknown: boolean) => {
    const res = await fetch(`/api/dictionary/${wordEntryId}/saved`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: unknown ? "new" : null }),
    });
    if (!res.ok) throw new Error(`mark unknown failed: ${res.status}`);
  }, []);

  return (
    <Player
      {...props}
      onMarkUnknown={onMarkUnknown}
      onFetchChunk={onFetchChunk}
      onFetchExplanation={onFetchExplanation}
      explanationPromptVersion={promptVersion}
      onSaveWord={onSaveWord}
      onProgress={onProgress}
      onSaveTokens={async (lineId, o) => toPlayerTokens(await saveLineTokens(lineId, o))}
      onResetTokens={async (lineId, span) => toPlayerTokens(await resetLineTokens(lineId, span))}
      onSearchEntries={searchEntries}
      onBack={() => router.push("/")}
      onNavigate={(key) => router.push(key === "home" ? "/" : `/${key}`)}
    />
  );
}
