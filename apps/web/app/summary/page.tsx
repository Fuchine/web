import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getSessionSummary } from "@/lib/summary";
import { SummaryView } from "./summary-view";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  const userName = user.name ?? user.email ?? "You";
  const userEmail = user.email ?? "";

  const { since } = await searchParams;
  const data = await getSessionSummary(db, session.user.id, since);

  return <SummaryView accountName={userName} accountEmail={userEmail} data={data} />;
}
