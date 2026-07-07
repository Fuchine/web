import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getQueue } from "@/lib/queue";
import { createImport, type ImportRequest } from "@/lib/import";
import { enforceRateLimit, retryAfterHeader } from "@/lib/rate-limit";

// POST /api/import — register a video for import. Body is submitted by the
// browser extension: { url, title?, channel?, durationS?, language?, captions[] }.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = (await req.json().catch(() => null)) as ImportRequest | null;
  const result = await createImport(db, getQueue(), body ?? {}, {
    checkRateLimit: () => enforceRateLimit("importNew", userId),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: retryAfterHeader(result),
  });
}
