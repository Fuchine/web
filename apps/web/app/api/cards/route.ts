import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { mineSentence } from "@/lib/cards";

// POST /api/cards — mine a subtitle line into a review card.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await mineSentence(db, session.user.id, body);
  return NextResponse.json(result.body, { status: result.status });
}
