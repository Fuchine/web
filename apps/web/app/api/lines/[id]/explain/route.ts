import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { explainLine } from "@/lib/explain";
import { retryAfterHeader } from "@/lib/rate-limit";

// POST /api/lines/:id/explain — layer-2 explanation (cache-first; force=regenerate).
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { force?: unknown };
  const result = await explainLine(db, session.user.id, id, {
    encryptionKey: process.env.FUCHINE_ENCRYPTION_KEY,
    force: body.force === true,
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: retryAfterHeader(result),
  });
}
