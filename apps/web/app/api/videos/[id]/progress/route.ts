import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recordProgress } from "@/lib/progress";

// POST /api/videos/:id/progress — watch-time + seen-lines beacon from the player.
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
  const result = await recordProgress(db, session.user.id, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
