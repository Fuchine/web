import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getReviewQueue } from "@/lib/cards";

// GET /api/review/queue — cards due now, with clip + sentence + intervals.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { cards, wordEntries } = await getReviewQueue(db, session.user.id);
  return NextResponse.json({ cards, wordEntries });
}
