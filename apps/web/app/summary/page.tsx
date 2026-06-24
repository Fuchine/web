import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SummaryView } from "./summary-view";

export default async function SummaryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  const userName = user.name ?? user.email ?? "You";
  const userEmail = user.email ?? "";

  return <SummaryView accountName={userName} accountEmail={userEmail} />;
}
