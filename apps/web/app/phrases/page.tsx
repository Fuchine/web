import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listPhrases } from "@/lib/phrases";
import { getReviewQueue } from "@/lib/cards";
import { AppLayout } from "@/components/AppLayout";
import { PhrasesView } from "./phrases-view";

export default async function PhrasesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const [phrases, queue] = await Promise.all([
    listPhrases(db, userId),
    getReviewQueue(db, userId),
  ]);

  return (
    <AppLayout
      account={{ name: session.user.name ?? session.user.email ?? "You", sub: session.user.email ?? undefined }}
      reviewDue={queue.length}
      activeKey="phrases"
    >
      <PhrasesView phrases={phrases} reviewDue={queue.length} />
    </AppLayout>
  );
}
