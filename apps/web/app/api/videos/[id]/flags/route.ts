import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { setVideoFlag, clearVideoFlag, VIDEO_FLAGS, type VideoFlag } from "@/lib/video-flags";

function parseFlag(v: unknown): VideoFlag | null {
  return VIDEO_FLAGS.includes(v as VideoFlag) ? (v as VideoFlag) : null;
}

// POST /api/videos/:id/flags { flag } — set; DELETE { flag } — clear.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { flag?: unknown };
  const flag = parseFlag(body.flag);
  if (!flag) return NextResponse.json({ error: "flag must be saved|hidden|not_interested" }, { status: 400 });
  const { id } = await ctx.params;
  await setVideoFlag(db, session.user.id, id, flag);
  return NextResponse.json({ flag, set: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { flag?: unknown };
  const flag = parseFlag(body.flag);
  if (!flag) return NextResponse.json({ error: "flag must be saved|hidden|not_interested" }, { status: 400 });
  const { id } = await ctx.params;
  await clearVideoFlag(db, session.user.id, id, flag);
  return NextResponse.json({ flag, set: false });
}
