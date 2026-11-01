import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { parseLimit } from "@/lib/list-query";
import { countUncuratedCards, listUncuratedCards } from "@/lib/phrases";

// GET /api/phrases/curate — uncurated cards ("mine now, curate later", T3.6),
// newest first, one page at a time: ?cursor=...&limit=50. Each page carries
// the dictionary entries its tokens use and any cached explanation (read-only:
// this never generates one). The first page (no cursor) includes `total`.
// Curating reuses PATCH /api/cards/:id (notes; "" = curated without notes) and
// DELETE /api/cards/:id.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimit(url.searchParams.get("limit"), 50);
  const [page, total] = await Promise.all([
    listUncuratedCards(db, session.user.id, { cursor, limit }),
    cursor ? Promise.resolve(null) : countUncuratedCards(db, session.user.id),
  ]);
  return NextResponse.json({ ...page, ...(total !== null ? { total } : {}) });
}
