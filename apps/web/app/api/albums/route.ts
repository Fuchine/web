import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listAlbums, createAlbum } from "@/lib/albums";

// GET /api/albums — list the user's albums with video counts.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const albums = await listAlbums(db, session.user.id);
  return NextResponse.json({ albums });
}

// POST /api/albums — create an album.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await createAlbum(db, session.user.id, body);
  return NextResponse.json(result.body, { status: result.status });
}
