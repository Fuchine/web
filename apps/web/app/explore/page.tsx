import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { countDueCards } from "@/lib/cards";
import { getExplore } from "@/lib/explore";
import { parseBand } from "@/lib/explore-rank";
import { requestCoverageRefresh } from "@/lib/queue";
import { AppLayout } from "@/components/AppLayout";
import { ExploreView } from "./explore-view";

// /explore (T3.10, innovation 1 part 2): the catalog ranked for THIS user by
// personal coverage near a target band (default 90–95%), novelty (unknown
// common words) and narrow viewing (same channel as something watched
// recently). Cold start shows curated comprehensible-input channels.
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ band?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const band = parseBand((await searchParams).band);

  const [result, reviewDue] = await Promise.all([
    getExplore(db, userId, { band, onStale: requestCoverageRefresh }),
    countDueCards(db, userId),
  ]);

  return (
    <AppLayout
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={reviewDue}
      activeKey="explore"
    >
      <ExploreView
        band={result.band}
        items={result.items}
        refreshing={result.refreshing}
        coldStart={result.coldStart}
        starter={result.starter}
        knownWords={result.knownWords}
        catalogSize={result.catalogSize}
      />
    </AppLayout>
  );
}
