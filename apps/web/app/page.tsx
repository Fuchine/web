import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getLatestVideo } from "@/lib/study";
import { countDueCards } from "@/lib/cards";
import { isOnboardingDone } from "@/lib/settings";
import { getDailyProgress, getTomorrowProjection } from "@/lib/goals";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [done, mostRecent, reviewDue, todaysGoals, tomorrow] = await Promise.all([
    isOnboardingDone(db, userId),
    getLatestVideo(db),
    countDueCards(db, userId),
    getDailyProgress(db, userId),
    getTomorrowProjection(db, userId),
  ]);
  if (!done) redirect("/onboarding");

  return (
    <DashboardView
      account={{
        name: session.user.name ?? session.user.email ?? "You",
        sub: session.user.email ?? undefined,
      }}
      reviewDue={reviewDue}
      todaysGoals={todaysGoals}
      tomorrow={tomorrow}
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
