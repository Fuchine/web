import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getVideoWithLines } from "@/lib/study";
import { PlayerView } from "./player-view";
import "./player.css";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const result = await getVideoWithLines(db, id);
  if (!result) notFound();
  if (result.video.status !== "done") redirect("/");

  return (
    <PlayerView
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
        tokens: (l.tokens ?? []) as {
          surface: string;
          lemma: string;
          reading: string | null;
          pos: string | null;
          wordEntryId: string | null;
        }[],
      }))}
      account={{
        name: session.user.name ?? session.user.email ?? "You",
        sub: session.user.email ?? undefined,
      }}
    />
  );
}
