import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { saveWord, unsaveWord, setWordStatus, type WordStatus } from "@/lib/dictionary";

const STATUSES: WordStatus[] = ["known", "learning", "new"];

// POST /api/dictionary/:id/saved — bookmark; DELETE — remove.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await saveWord(db, session.user.id, id);
  return NextResponse.json({ saved: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await unsaveWord(db, session.user.id, id);
  return NextResponse.json({ saved: false });
}

// PATCH — set (or clear, with status:null) the manual learning-status override.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status;
  if (status !== null && !STATUSES.includes(status as WordStatus)) {
    return NextResponse.json({ error: "status must be known|learning|new or null" }, { status: 400 });
  }
  const { id } = await ctx.params;
  await setWordStatus(db, session.user.id, id, status as WordStatus | null);
  return NextResponse.json({ saved: true, status });
}
