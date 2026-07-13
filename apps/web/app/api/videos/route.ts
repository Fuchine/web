import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos, getComprehensionByVideo } from "@/lib/study";
import { toLibraryVideo } from "@/lib/library";

// GET /api/videos — the library, one page at a time (infinite scroll).
// Paginated: ?cursor=t:<ts>:<id>&limit=24. Returns the same enriched
// LibraryVideo shape the server page builds, so appended pages render
// identically (comprehension scoped to the page — word_examples is catalog-sized).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "24", 10), 100);
  const { items, nextCursor } = await listVideos(db, { cursor, limit });
  const comprehension = await getComprehensionByVideo(
    db,
    session.user.id,
    items.map((v) => v.id),
  );
  const videos = items.map((v) => toLibraryVideo(v, comprehension.get(v.id) ?? null));
  return NextResponse.json({ videos, nextCursor });
}
