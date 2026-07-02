import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppLayout } from "@/components/AppLayout";
import { KanaView } from "./kana-view";

export default async function KanaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userName = session!.user!.name ?? session!.user!.email ?? "You";
  const userEmail = session!.user!.email ?? "";

  return (
    <AppLayout
      account={{ name: userName, sub: userEmail }}
      activeKey="kana"
    >
      <KanaView />
    </AppLayout>
  );
}
