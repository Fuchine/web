import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listAlbumsForView } from "@/lib/albums";
import { listVideos } from "@/lib/study";
import { getReviewQueue } from "@/lib/cards";
import { AlbumsView, type AlbumCardData, type PickerVideo } from "./albums-view";

export default async function AlbumsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [albums, videoRows, queue] = await Promise.all([
    listAlbumsForView(db, userId),
    listVideos(db),
    getReviewQueue(db, userId),
  ]);

  const libraryVideos: PickerVideo[] = videoRows.map((v) => ({
    id: v.id,
    title: v.title,
    channel: v.channel,
    durationS: v.durationS,
  }));

  return (
    <AlbumsView
      albums={albums as AlbumCardData[]}
      libraryVideos={libraryVideos}
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={queue.length}
    />
  );
}
