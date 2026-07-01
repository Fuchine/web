import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppLayout } from "@/components/AppLayout";
import { db } from "@/lib/db";
import { getStats } from "@/lib/stats";
import { StatsView } from "./stats-view";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  const userName = user.name ?? user.email ?? "You";
  const userEmail = user.email ?? "";

  const data = await getStats(db, session.user.id);

  return (
    <AppLayout
      account={{ name: userName, sub: userEmail }}
      activeKey="stats"
    >
      <StatsView data={data} />
    </AppLayout>
  );
}
