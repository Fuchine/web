import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sentenceCards } from "@fuchine/db";
import { MAX_NOTES_LEN } from "@/lib/cards";

// PATCH /api/cards/:id — update notes on a sentence card
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  if (typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
  }

  const updated = await db
    .update(sentenceCards)
    .set({ notes: body.notes.slice(0, MAX_NOTES_LEN) })
    .where(and(eq(sentenceCards.id, id), eq(sentenceCards.userId, session.user.id)))
    .returning({ id: sentenceCards.id, notes: sentenceCards.notes });

  if (updated.length === 0) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  return NextResponse.json(updated[0], { status: 200 });
}
