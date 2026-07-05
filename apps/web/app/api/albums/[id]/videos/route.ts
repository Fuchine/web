import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { addVideoToAlbum, removeVideoFromAlbum } from "@/lib/albums";

// POST /api/albums/:id/videos — add a video to an album ({ videoId }).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await addVideoToAlbum(db, session.user.id, id, body.videoId);
  return NextResponse.json(result.body, { status: result.status });
}

// DELETE /api/albums/:id/videos?videoId=… — remove a video from an album.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const videoId = new URL(req.url).searchParams.get("videoId");
  const result = await removeVideoFromAlbum(db, session.user.id, id, videoId ?? undefined);
  return NextResponse.json(result.body, { status: result.status });
}
