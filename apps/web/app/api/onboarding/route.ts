import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { updateSettings, completeOnboarding } from "@/lib/settings";

// POST /api/onboarding — save language + key (optional) and mark onboarding done.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) ?? {};
  const userId = session.user.id;

  const result = await updateSettings(db, userId, body, process.env.FUCHINE_ENCRYPTION_KEY);
  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  await completeOnboarding(db, userId);
  return NextResponse.json({ ok: true, ...result.body });
}
