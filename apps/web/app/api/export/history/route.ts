import { auth } from "@/auth";
import { db } from "@/lib/db";
import { exportReviewLogsCsv } from "@/lib/fsrs";

// GET /api/export/history — the user's review history to take along with the
// Anki deck (T3.3): one row per review log in the FSRS optimizer's revlog CSV
// (card_id,review_time,review_rating,review_state,review_duration), the same
// writer as /api/review/logs/export (T3.1). card_id is the Fuchine card id;
// the Lapis deck's GUID column is `fuchine-<card id>`, so the two files join.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const csv = await exportReviewLogsCsv(db, session.user.id);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="fuchine-review-history.csv"',
      "cache-control": "no-store",
    },
  });
}
