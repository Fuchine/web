import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { translateChunk } from "@/lib/translate";

// POST /api/videos/:id/translate — translate one 30-line chunk (cache-first).
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { chunkIdx?: unknown };
  if (typeof body.chunkIdx !== "number" || body.chunkIdx < 0) {
    return NextResponse.json({ error: "chunkIdx (number >= 0) required" }, { status: 400 });
  }
  const result = await translateChunk(db, id, body.chunkIdx);
  return NextResponse.json(result.body, { status: result.status });
}
