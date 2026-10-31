import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createApiToken, listApiTokens } from "@/lib/api-tokens";
import { enforceRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Per-user API tokens (T2.11). Session-only: a token can never mint or list
// tokens (the auth-coverage test asserts Bearer is refused here).

// GET /api/tokens — the user's tokens (active and revoked). Never the secret.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tokens = await listApiTokens(db, session.user.id);
  return NextResponse.json({ tokens }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/tokens { name } — create a token; the raw value is in this response only.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const verdict = await enforceRateLimit("tokenCreate", userId);
  if (!verdict.ok) {
    const r = tooManyRequests(verdict, "Too many tokens created. Try again later.");
    return NextResponse.json(r.body, {
      status: r.status,
      headers: { "Retry-After": String(verdict.retryAfterSeconds) },
    });
  }
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await createApiToken(db, userId, body);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
