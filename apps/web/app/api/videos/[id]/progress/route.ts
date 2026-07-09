import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recordProgress } from "@/lib/progress";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/videos/:id/progress — watch-time + seen-lines beacon from the player.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Throttle bursts per user (3/15s) so a scripted loop can't inflate watch time
  // or "seen" words, while still admitting the legit flush + on-unload beacon.
  // Over-frequency is silently discarded (200, not 429) so the player never errors.
  const rl = await enforceRateLimit("progressBeacon", session.user.id);
  if (!rl.ok) {
    return NextResponse.json({ recorded: false, throttled: true }, { status: 200 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await recordProgress(db, session.user.id, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
