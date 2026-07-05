import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recordWordClick } from "@/lib/progress";

// POST /api/dictionary/:id/click — the user opened the popup for this word.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await recordWordClick(db, session.user.id, id);
  return NextResponse.json(result.body, { status: result.status });
}
