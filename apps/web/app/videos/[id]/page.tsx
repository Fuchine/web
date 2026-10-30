import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getVideoWithLines, getWordStatuses } from "@/lib/study";
import { isUuid } from "@/lib/ids";
import { getSavedWordIds } from "@/lib/dictionary";
import { hiraToRomaji } from "@fuchine/nlp";
import { PlayerView } from "./player-view";
import { ErrorScreen } from "./error-screen";
import "./player.css";

export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const userId = session.user.id as string;
  const result = await getVideoWithLines(db, id, { userId });
  if (!result) notFound();
  if (result.video.status === "failed") {
    return (
      <ErrorScreen
        title={result.video.title}
        reason={result.video.statusReason ?? "Unknown error"}
      />
    );
  }
  if (result.video.status !== "done") redirect("/");

  const { line } = await searchParams;
  const initialLineId = line && result.lines.some((l) => l.id === line) ? line : undefined;
  // Known-word signals for the words in this video (T3.8).
  // Corrected tokens (T3.7): a fixed word is colored by its corrected entry.
  const wordIds = result.lines.flatMap((l) => l.tokens.flatMap((t) => (t.wordEntryId ? [t.wordEntryId] : [])));
  const [savedWordIds, wordStatuses] = await Promise.all([
    getSavedWordIds(db, userId),
    getWordStatuses(db, userId, wordIds),
  ]);

  return (
    <PlayerView
      initialLineId={initialLineId}
      savedWordIds={savedWordIds}
      wordStatuses={wordStatuses}
      video={{
        id: result.video.id,
        title: result.video.title,
        channel: result.video.channel,
        sourceId: result.video.sourceId,
      }}
      lines={result.lines.map((l) => ({
        id: l.id,
        idx: l.idx,
        tStartMs: l.tStartMs,
        tEndMs: l.tEndMs,
        textOriginal: l.textOriginal,
        textTranslation: l.textTranslation,
        tokens: l.tokens.map((t) => ({
          ...t,
          romaji: t.romaji ?? (t.reading ? hiraToRomaji(t.reading) : null),
        })),
        ...(l.tokenSpans ? { tokenSpans: l.tokenSpans } : {}),
      }))}
      translatedChunks={result.translatedChunks}
      account={{
        name: session.user.name ?? session.user.email ?? "You",
        sub: session.user.email ?? undefined,
      }}
    />
  );
}
