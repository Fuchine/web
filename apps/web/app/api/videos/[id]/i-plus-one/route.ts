import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isUuid } from "@/lib/ids";
import { db } from "@/lib/db";
import { listIPlusOneSuggestions } from "@/lib/i-plus-one";

const MAX_LIMIT = 10;

// GET /api/videos/:id/i-plus-one?limit=3 — this user's i+1 lines of a video
// that they have not mined yet (T3.10; the curation screen's suggestions).
// Read-only: mining stays an explicit POST /api/cards.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "video not found" }, { status: 404 });
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? 3);
  const limit = Number.isInteger(raw) ? Math.min(MAX_LIMIT, Math.max(1, raw)) : 3;
  const lines = await listIPlusOneSuggestions(db, session.user.id, id, limit);
  if (!lines) return NextResponse.json({ error: "video not found" }, { status: 404 });
  return NextResponse.json({ lines });
}
