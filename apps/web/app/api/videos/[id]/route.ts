import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getVideoWithLines } from "@/lib/study";
import { requestTailPrewarm } from "@/lib/prewarm";

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
  // First-open audience signal: warm the rest of the video's explanations in
  // the background (item 2). Fire-and-forget; never delays this response.
  requestTailPrewarm(id);
  return NextResponse.json(result);
}
