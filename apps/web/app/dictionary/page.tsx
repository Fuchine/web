import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppLayout } from "@/components/AppLayout";
import { DictionaryView } from "./dictionary-view";

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  // ?q= pre-fills the search (the Explain panel's "Check in dictionary" link, T3.12).
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? "";
  return (
    <AppLayout
      account={{ name: user.name ?? user.email ?? "You", sub: user.email ?? "" }}
      activeKey="dictionary"
    >
      <DictionaryView initialQuery={initialQuery} />
    </AppLayout>
  );
}
