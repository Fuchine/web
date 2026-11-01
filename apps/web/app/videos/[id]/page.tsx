import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getComprehensionByVideo, getVideoWithLines, getWordStatuses } from "@/lib/study";
import { isUuid } from "@/lib/ids";
import { getSavedStatuses, getSavedWordIds } from "@/lib/dictionary";
import { getIPlusOneLines } from "@/lib/i-plus-one";
import { loadKnownWordParams } from "@/lib/known-words";
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
  // Coverage (T3.9): the same per-user number the library shows.
  // i+1 lines (T3.10): one query over the corrected tokens, same tier rule.
  const knownParams = await loadKnownWordParams(db, userId);
  const [savedWordIds, wordStatuses, coverageMap, manual, iPlusOne] = await Promise.all([
    getSavedWordIds(db, userId),
    getWordStatuses(db, userId, wordIds, knownParams),
    getComprehensionByVideo(db, userId, [id], knownParams),
    getSavedStatuses(db, userId),
    getIPlusOneLines(db, userId, result.lines, result.video.language, knownParams),
  ]);
  const cov = coverageMap.get(id);
  const inVideo = new Set(wordIds);
  const markedUnknownIds = Object.keys(manual).filter((w) => manual[w] === "new" && inVideo.has(w));

  return (
    <PlayerView
      initialLineId={initialLineId}
      savedWordIds={savedWordIds}
      wordStatuses={wordStatuses}
      coverage={cov ? { headline: cov.headline, low: cov.low, high: cov.high, unique: cov.unique } : null}
      markedUnknownIds={markedUnknownIds}
      iPlusOne={Object.fromEntries([...iPlusOne].map(([lineId, hit]) => [lineId, hit.tokenIdx]))}
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
