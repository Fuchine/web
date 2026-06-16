import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos } from "@/lib/study";
import { LibraryView, type LibraryVideo } from "./library-view";

const LEVEL: Record<string, number> = { beginner: 1, intermediate: 3, advanced: 5 };

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rows = await listVideos(db);
  const videos: LibraryVideo[] = rows.map((v) => ({
    id: v.id,
    title: v.title,
    channel: v.channel,
    durationS: v.durationS,
    status: v.status,
    level: v.levelEstimate ? (LEVEL[v.levelEstimate] ?? null) : null,
    comprehension: null, // computed from user_word_stats later
  }));

  return (
    <LibraryView
      videos={videos}
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
    />
  );
}
