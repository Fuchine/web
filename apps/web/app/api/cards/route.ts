import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isUuid } from "@/lib/ids";
import { db } from "@/lib/db";
import { mineSentence } from "@/lib/cards";

// POST /api/cards — mine a subtitle line into a review card.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) ?? {};
  // A malformed id can't match a line; answer like a missing one instead of
  // letting Postgres raise "invalid input syntax for type uuid" (C2).
  if (body.subtitleLineId && !isUuid(body.subtitleLineId)) {
    return NextResponse.json({ error: "subtitle line not found" }, { status: 404 });
  }
  const result = await mineSentence(db, session.user.id, body);
  return NextResponse.json(result.body, { status: result.status });
}
