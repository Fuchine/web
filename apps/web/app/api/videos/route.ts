import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos, getComprehensionByVideo, VIDEO_SORTS, type VideoSort } from "@/lib/study";
import { toLibraryVideo } from "@/lib/library";

// GET /api/videos — the library, one page at a time (infinite scroll).
// Paginated: ?cursor=...&limit=24, plus server-side ?q= (title/channel),
// ?category= and ?sort= (newest|short|level) over the whole catalog. Returns
// the same enriched LibraryVideo shape the server page builds, so appended
// pages render identically (comprehension scoped to the page — word_examples
// is catalog-sized). First page (no cursor) includes `total` under the same
// filters, for real header counts.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "24", 10), 100);
  const q = url.searchParams.get("q")?.slice(0, 100) || undefined;
  const category = url.searchParams.get("category")?.slice(0, 50) || undefined;
  const sortParam = url.searchParams.get("sort");
  const sort = VIDEO_SORTS.includes(sortParam as VideoSort)
    ? (sortParam as VideoSort)
    : undefined;

  const { items, nextCursor, total } = await listVideos(db, {
    cursor,
    limit,
    q,
    category,
    sort,
  });
  const comprehension = await getComprehensionByVideo(
    db,
    session.user.id,
    items.map((v) => v.id),
  );
  const videos = items.map((v) => toLibraryVideo(v, comprehension.get(v.id) ?? null));
  return NextResponse.json({ videos, nextCursor, total });
}
