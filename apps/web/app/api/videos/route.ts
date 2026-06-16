import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listVideos } from "@/lib/study";

// GET /api/videos — the library (all videos with line counts).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const videos = await listVideos(db);
  return NextResponse.json({ videos });
}
