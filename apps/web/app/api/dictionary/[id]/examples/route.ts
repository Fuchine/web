import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getWordExamples } from "@/lib/dictionary";

// GET /api/dictionary/:id/examples — occurrences of a word in the user's videos.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const examples = await getWordExamples(db, id);
  return NextResponse.json({ examples });
}
