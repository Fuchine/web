import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { explainLine } from "@/lib/explain";

// POST /api/lines/:id/explain — layer-2 explanation (cache-first; BYOK on miss).
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await explainLine(db, session.user.id, id, {
    encryptionKey: process.env.FUCHINE_ENCRYPTION_KEY,
  });
  return NextResponse.json(result.body, { status: result.status });
}
