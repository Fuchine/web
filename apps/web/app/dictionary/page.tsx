import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppLayout } from "@/components/AppLayout";
import { DictionaryView } from "./dictionary-view";

export default async function DictionaryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  return (
    <AppLayout
      account={{ name: user.name ?? user.email ?? "You", sub: user.email ?? "" }}
      activeKey="dictionary"
    >
      <DictionaryView />
    </AppLayout>
  );
}
