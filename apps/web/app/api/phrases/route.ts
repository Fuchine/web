import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listPhrases } from "@/lib/phrases";

// GET /api/phrases — the user's mined phrases, one page at a time (infinite
// scroll). Paginated: ?cursor=t:<ts>:<id>&limit=50. Scoped to the session user.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const { items, nextCursor } = await listPhrases(db, session.user.id, { cursor, limit });
  return NextResponse.json({ phrases: items, nextCursor });
}
