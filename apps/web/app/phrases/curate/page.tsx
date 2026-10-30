import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { countDueCards, MAX_NOTES_LENGTH } from "@/lib/cards";
import { getSavedWordIds } from "@/lib/dictionary";
import { countUncuratedCards, listUncuratedCards } from "@/lib/phrases";
import { AppLayout } from "@/components/AppLayout";
import { CurateView } from "./curate-view";

// /phrases/curate — "mine now, curate later" (T3.6): every card mined without
// notes and not yet reviewed, newest first, grouped by video, curated in one
// sitting.
export default async function CuratePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const [page, total, reviewDue, savedWordIds] = await Promise.all([
    listUncuratedCards(db, userId),
    countUncuratedCards(db, userId),
    countDueCards(db, userId),
    getSavedWordIds(db, userId),
  ]);

  return (
    <AppLayout
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={reviewDue}
      activeKey="phrases"
    >
      <CurateView
        initial={page}
        total={total}
        savedWordIds={savedWordIds}
        maxNotes={MAX_NOTES_LENGTH}
      />
    </AppLayout>
  );
}
