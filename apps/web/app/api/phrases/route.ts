import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  listPhrases,
  countPhrasesByStatus,
  PHRASE_SORTS,
  PHRASE_STATUSES,
  type PhraseSort,
  type PhraseStatus,
} from "@/lib/phrases";

// GET /api/phrases — the user's mined phrases, one page at a time (infinite
// scroll). Paginated: ?cursor=...&limit=50, plus server-side ?q= (text/
// translation/video title), ?status= (due|learning|new|known) and ?sort=
// (recent|oldest|az|status) over the user's whole set. First page (no cursor)
// includes `counts` — real per-status totals for the filter chips.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const q = url.searchParams.get("q")?.slice(0, 100) || undefined;
  const statusParam = url.searchParams.get("status");
  const status = PHRASE_STATUSES.includes(statusParam as PhraseStatus)
    ? (statusParam as PhraseStatus)
    : undefined;
  const sortParam = url.searchParams.get("sort");
  const sort = PHRASE_SORTS.includes(sortParam as PhraseSort)
    ? (sortParam as PhraseSort)
    : undefined;

  const [{ items, nextCursor }, counts] = await Promise.all([
    listPhrases(db, session.user.id, { cursor, limit, q, status, sort }),
    cursor ? Promise.resolve(null) : countPhrasesByStatus(db, session.user.id),
  ]);
  return NextResponse.json({ phrases: items, nextCursor, ...(counts ? { counts } : {}) });
}
