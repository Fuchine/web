import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getFsrsSettings, updateFsrsSettings } from "@/lib/fsrs";

// GET /api/settings/fsrs — current FSRS params/retention, review count, the
// optimizer's minimum, and the workload preview per retention (T3.1).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const view = await getFsrsSettings(db, session.user.id);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

// PUT /api/settings/fsrs — store fitted FSRS-7 params and/or desired retention.
// Body: { params?: number[34] | null, desiredRetention?: number | null }
// (null resets to the default). Params are validated against the FSRS-7 shape
// and bounds; nothing is clipped.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const result = await updateFsrsSettings(db, session.user.id, body);
  return NextResponse.json(result.body, { status: result.status });
}
