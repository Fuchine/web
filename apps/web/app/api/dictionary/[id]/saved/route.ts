import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { saveWord, unsaveWord } from "@/lib/dictionary";

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
