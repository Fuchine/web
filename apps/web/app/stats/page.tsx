import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppLayout } from "@/components/AppLayout";
import { StatsView } from "./stats-view";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  const userName = user.name ?? user.email ?? "You";
  const userEmail = user.email ?? "";

  return (
    <AppLayout
      account={{ name: userName, sub: userEmail }}
      activeKey="stats"
    >
      <StatsView />
    </AppLayout>
  );
}
