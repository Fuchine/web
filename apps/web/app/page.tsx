import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos } from "@/lib/study";
import { getReviewQueue } from "@/lib/cards";
import { isOnboardingDone } from "@/lib/settings";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [done, rows, queue] = await Promise.all([
    isOnboardingDone(db, userId),
    listVideos(db),
    getReviewQueue(db, userId),
  ]);
  if (!done) redirect("/onboarding");

  const mostRecent = rows[0] ?? null;

  return (
    <DashboardView
      account={{
        name: session.user.name ?? session.user.email ?? "You",
        sub: session.user.email ?? undefined,
      }}
      reviewDue={queue.length}
      continueVideo={
        mostRecent
          ? {
              id: mostRecent.id,
              title: mostRecent.title,
              channel: mostRecent.channel,
              source: mostRecent.source,
              sourceId: mostRecent.sourceId,
              durationS: mostRecent.durationS,
            }
          : null
      }
    />
  );
}
