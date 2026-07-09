import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recordWordClick } from "@/lib/progress";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/dictionary/:id/click — the user opened the popup for this word.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // At most 1 click/60s per (user, word): repeated opens of the same popup aren't
  // a study signal. Denied = 200 + discard, never a 429.
  const rl = await enforceRateLimit("wordClick", `${session.user.id}:${id}`);
  if (!rl.ok) {
    return NextResponse.json({ recorded: false, throttled: true }, { status: 200 });
  }

  const result = await recordWordClick(db, session.user.id, id);
  return NextResponse.json(result.body, { status: result.status });
}
