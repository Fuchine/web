import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getVideoWithLines } from "@/lib/study";
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
  const result = await getVideoWithLines(db, id);
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
  const savedWordIds = await getSavedWordIds(db, session.user.id as string);

  return (
    <PlayerView
      initialLineId={initialLineId}
      savedWordIds={savedWordIds}
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
        tokens: ((l.tokens ?? []) as {
          surface: string;
          lemma: string;
          reading: string | null;
          romaji: string | null;
          pos: string | null;
          wordEntryId: string | null;
        }[]).map((t) => ({
          ...t,
          romaji: t.romaji ?? (t.reading ? hiraToRomaji(t.reading) : null),
        })),
      }))}
      translatedChunks={result.translatedChunks}
      account={{
        name: session.user.name ?? session.user.email ?? "You",
        sub: session.user.email ?? undefined,
      }}
    />
  );
}
