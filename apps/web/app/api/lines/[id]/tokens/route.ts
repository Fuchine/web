import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isUuid } from "@/lib/ids";
import { db } from "@/lib/db";
import { deleteTokenOverrides, putTokenOverride } from "@/lib/token-overrides";
import { enforceRateLimit, retryAfterHeader, tooManyRequests } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };
type Handler = typeof putTokenOverride | typeof deleteTokenOverrides;

async function handle(req: Request, ctx: Ctx, run: Handler) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "line not found" }, { status: 404 });

  const rl = await enforceRateLimit("tokenFix", session.user.id);
  if (!rl.ok) {
    const denied = tooManyRequests(rl, "Too many corrections — slow down a moment.");
    return NextResponse.json(denied.body, { status: denied.status, headers: retryAfterHeader(denied) });
  }

  const body = await req.json().catch(() => (req.method === "DELETE" ? {} : null));
  if (body === null) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  const result = await run(db, session.user.id, id, body);
  return NextResponse.json(result.body, { status: result.status });
}

// PUT /api/lines/:id/tokens — save this user's correction of a token span
// (T3.7). Body: { startIdx, endIdx, tokens: [{ surface, lemma?, reading?, pos?,
// wordEntryId? }] }; wordEntryId omitted = resolve from the dictionary, null =
// not a dictionary word.
export async function PUT(req: Request, ctx: Ctx) {
  return handle(req, ctx, putTokenOverride);
}

// DELETE /api/lines/:id/tokens — reset this user's corrections on the line
// (body { startIdx, endIdx? } = only those overlapping the span).
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(req, ctx, deleteTokenOverrides);
}
