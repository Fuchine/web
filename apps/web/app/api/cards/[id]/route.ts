import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isUuid } from "@/lib/ids";
import { db } from "@/lib/db";
import { deleteCard, updateCardNotes } from "@/lib/cards";

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

  if (!isUuid(id)) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await updateCardNotes(db, session.user.id, id, body);
  return NextResponse.json(result.body, { status: result.status });
}

// DELETE /api/cards/:id — remove a card (the Player's "Undo" after mining).
// Scoped to the session user: someone else's card is a 404.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const result = await deleteCard(db, session.user.id, id);
  return NextResponse.json(result.body, { status: result.status });
}
