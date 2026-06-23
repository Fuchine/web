import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { updateSettings } from "@/lib/settings";

// PATCH /api/settings — update provider, BYOK key, and explanation language.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await updateSettings(
    db,
    session.user.id,
    body,
    process.env.FUCHINE_ENCRYPTION_KEY,
  );
  return NextResponse.json(result.body, { status: result.status });
}
