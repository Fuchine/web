import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getSavedWordIds } from "@/lib/dictionary";

// GET /api/dictionary/saved — the user's saved word_entry ids.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ids = await getSavedWordIds(db, session.user.id);
  return NextResponse.json({ ids });
}
