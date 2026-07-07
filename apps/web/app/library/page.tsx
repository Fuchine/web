import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos, getComprehensionByVideo } from "@/lib/study";
import { countDueCards } from "@/lib/cards";
import { getStats } from "@/lib/stats";
import { getVideoFlags } from "@/lib/video-flags";
import { getAlbumMemberships } from "@/lib/albums";
import { LibraryView, type LibraryVideo } from "../library-view";

const LEVEL: Record<string, number> = { beginner: 1, intermediate: 3, advanced: 5 };

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const [rows, reviewDue, comprehension, stats, flags, albums] = await Promise.all([
    listVideos(db),
    countDueCards(db, userId),
    getComprehensionByVideo(db, userId),
    getStats(db, userId),
    getVideoFlags(db, userId),
    getAlbumMemberships(db, userId),
  ]);

  const videos: LibraryVideo[] = rows.map((v) => ({
    id: v.id,
    title: v.title,
    channel: v.channel,
    source: v.source,
    sourceId: v.sourceId,
    durationS: v.durationS,
    status: v.status,
    level: v.levelEstimate ? (LEVEL[v.levelEstimate] ?? null) : null,
    comprehension: comprehension.get(v.id) ?? null,
    embeddable: v.embeddable,
    category: v.category,
  }));

  return (
    <LibraryView
      videos={videos}
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={reviewDue}
      stats={{
        watchTimeHours: stats.kpis.watchTimeHours,
        videoCount: videos.length,
        wordsLearned: stats.kpis.wordsKnown,
        dayStreak: stats.kpis.dayStreak,
      }}
      activeKey="library"
      initialSaved={flags.saved}
      initialHidden={flags.hidden}
      albums={albums}
    />
  );
}
