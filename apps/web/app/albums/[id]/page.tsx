import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getAlbumDetail, listAlbumsForView } from "@/lib/albums";
import { getComprehensionByVideo } from "@/lib/study";
import { countDueCards } from "@/lib/cards";
import { AlbumDetailView, type AlbumDetailData } from "./album-detail-view";

export default async function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { id } = await params;

  const detail = await getAlbumDetail(db, userId, id);
  if (!detail) notFound();

  const [comprehension, forView, reviewDue] = await Promise.all([
    getComprehensionByVideo(db, userId, detail.videos.map((v) => v.id)),
    listAlbumsForView(db, userId),
    countDueCards(db, userId),
  ]);
  const stats = forView.find((a) => a.id === id);

  const album: AlbumDetailData = {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    pinned: detail.pinned,
    words: stats?.words ?? 0,
    pct: stats?.pct ?? 0,
    videos: detail.videos.map((v) => ({
      id: v.id,
      title: v.title,
      channel: v.channel,
      durationS: v.durationS,
      level: v.levelEstimate,
      comprehension: comprehension.get(v.id) ?? null,
    })),
  };

  return (
    <AlbumDetailView
      album={album}
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={reviewDue}
    />
  );
}
