import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { reviewCardById } from "@/lib/cards";

// POST /api/review/:cardId — grade a card. Body: { grade: 1|2|3|4 }.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cardId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { cardId } = await ctx.params;
  const body = (await req.json().catch(() => null)) ?? {};
  const result = await reviewCardById(db, session.user.id, cardId, Number(body.grade));
  return NextResponse.json(result.body, { status: result.status });
}
