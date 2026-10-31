import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getQueue } from "@/lib/queue";
import { createImport, type ImportRequest } from "@/lib/import";
import { enforceRateLimit, retryAfterHeader } from "@/lib/rate-limit";
import { authenticateRequest, unauthorizedResponseInit } from "@/lib/request-auth";

// POST /api/import — register a video for import. Body is submitted by the
// browser extension: { url, title?, channel?, durationS?, language?, captions[] }.
// The only route that accepts a per-user API token (T2.11, scope `import`):
// `Authorization: Bearer fch_…`, or — for extension versions before 0.2.0 —
// the session cookie (deprecated cross-origin path, see lib/csrf.ts).
export async function POST(req: Request) {
  const who = await authenticateRequest(req, "import");
  if (!who.ok) {
    const { body, init } = unauthorizedResponseInit(who);
    return NextResponse.json(body, init);
  }

  const userId = who.userId;
  const body = (await req.json().catch(() => null)) as ImportRequest | null;
  const result = await createImport(db, getQueue(), body ?? {}, {
    checkRateLimit: () => enforceRateLimit("importNew", userId),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: retryAfterHeader(result),
  });
}
