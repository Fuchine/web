import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { exportReviewLogsCsv } from "@/lib/fsrs";

// GET /api/review/logs/export — the signed-in user's own review_logs as the
// FSRS optimizer's revlog CSV (card_id,review_time,review_rating,review_state,
// review_duration). Feeds the in-browser optimizer on /settings (T3.1).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const csv = await exportReviewLogsCsv(db, session.user.id);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fuchine-revlog.csv"',
      "Cache-Control": "no-store",
    },
  });
}
