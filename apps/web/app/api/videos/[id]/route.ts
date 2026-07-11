import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getVideoWithLines } from "@/lib/study";
import { enqueueFullPrewarm } from "@/lib/queue";

// GET /api/videos/:id — the player payload: video + ordered subtitle lines.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await getVideoWithLines(db, id);
  if (!result) {
    return NextResponse.json({ error: "video not found" }, { status: 404 });
  }
  // First-open signal: warm the tail of this video's explanations in the
  // background (import only warms the head). Only for videos that finished
  // importing; fail-open, dedups on repeat opens, never blocks the payload.
  if (result.video.status === "done") {
    await enqueueFullPrewarm(id);
  }
  return NextResponse.json(result);
}
