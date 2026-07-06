import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getSavedWordIds, getSavedStatuses } from "@/lib/dictionary";

// GET /api/dictionary/saved — the user's saved word_entry ids + manual status overrides.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [ids, statuses] = await Promise.all([
    getSavedWordIds(db, session.user.id),
    getSavedStatuses(db, session.user.id),
  ]);
  return NextResponse.json({ ids, statuses });
}
