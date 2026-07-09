import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getReviewQueue } from "@/lib/cards";
import { AppLayout } from "@/components/AppLayout";
import { ReviewView } from "./review-view";

export default async function ReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session!.user!.id;
  const userName = session!.user!.name ?? session!.user!.email ?? "You";
  const userEmail = session!.user!.email ?? "";

  const { cards, wordEntries } = await getReviewQueue(db, userId);

  return (
    <AppLayout
      account={{ name: userName, sub: userEmail }}
      reviewDue={cards.length}
      activeKey="review"
    >
      <ReviewView initialCards={cards} wordEntries={wordEntries} />
    </AppLayout>
  );
}
