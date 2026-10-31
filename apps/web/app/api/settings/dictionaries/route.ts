import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { getDictionarySettings, updateDictionaryPrefs } from "@/lib/dictionaries";

// GET /api/settings/dictionaries — installed (instance-enabled) dictionaries,
// the user's enabled ones in order and their FreqSort list (T3.4).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const view = await getDictionarySettings(db, session.user.id);
  return NextResponse.json(
    { ...view, isAdmin: isAdminEmail(session.user.email) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// PUT /api/settings/dictionaries — body { enabled: string[] (ordered ids),
// frequency: string | null }. Unknown or disabled ids are rejected.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const result = await updateDictionaryPrefs(db, session.user.id, body);
  return NextResponse.json(result.body, { status: result.status });
}
