import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos } from "@/lib/study";

// GET /api/videos — the library (all videos with line counts).
// Paginated: ?cursor=t:<ts>:<id>&limit=24
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "24", 10), 100);
  const { items, nextCursor } = await listVideos(db, { cursor, limit });
  return NextResponse.json({ videos: items, nextCursor });
}
