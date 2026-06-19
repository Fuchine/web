import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppLayout } from "@/components/AppLayout";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session!.user!;
  const userId = user.id;

  const settings = await db.query.userSettings.findFirst({
    where: (s, { eq }) => eq(s.userId, userId as string),
  });

  const userName = user.name ?? user.email ?? "You";
  const userEmail = user.email ?? "";

  return (
    <AppLayout
      account={{ name: userName, sub: userEmail }}
      activeKey="settings"
    >
      <SettingsView
        user={{ name: user.name ?? "", email: userEmail, image: user.image ?? null }}
        settings={{
          learningLanguage: settings?.learningLanguage ?? "ja",
          explanationLanguage: settings?.explanationLanguage ?? "en",
          llmProvider: settings?.llmProvider ?? null,
        }}
      />
    </AppLayout>
  );
}
