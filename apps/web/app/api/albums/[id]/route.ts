import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isUuid } from "@/lib/ids";
import { db } from "@/lib/db";
import { updateAlbum, deleteAlbum } from "@/lib/albums";

// PATCH /api/albums/:id — rename or edit an album.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "album not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await updateAlbum(db, session.user.id, id, body);
  return NextResponse.json(result.body, { status: result.status });
}

// DELETE /api/albums/:id — delete an album (memberships cascade).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "album not found" }, { status: 404 });
  const result = await deleteAlbum(db, session.user.id, id);
  return NextResponse.json(result.body, { status: result.status });
}
