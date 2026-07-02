import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isOnboardingDone } from "@/lib/settings";
import { OnboardingView } from "./onboarding-view";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const done = await isOnboardingDone(db, session.user.id);
  if (done) redirect("/");

  const name = firstName(session.user.name ?? session.user.email ?? "");

  return <OnboardingView name={name} />;
}

function firstName(raw: string): string {
  if (!raw) return "";
  if (raw.includes("@")) {
    const local = raw.split("@")[0] ?? raw;
    const base = local.split(/[._\d]/)[0] ?? local;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return raw.split(" ")[0] ?? raw;
}
