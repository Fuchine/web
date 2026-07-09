import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listPhrases } from "@/lib/phrases";
import { countDueCards } from "@/lib/cards";
import { AppLayout } from "@/components/AppLayout";
import { PhrasesView } from "./phrases-view";

export default async function PhrasesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const [phrases, reviewDue] = await Promise.all([
    listPhrases(db, userId),
    countDueCards(db, userId),
  ]);

  return (
    <AppLayout
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={reviewDue}
      activeKey="phrases"
    >
      <PhrasesView phrases={phrases} reviewDue={reviewDue} />
    </AppLayout>
  );
}
