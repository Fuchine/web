import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { deleteAccount } from "@/lib/account";

// DELETE /api/account — permanently delete the signed-in user and all their
// data (schema cascades handle the per-user rows). Videos/subtitles stay.
// The delete target is always the session's own user; the body only carries the
// typed confirmation, so this can never delete another account.
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  const result = await deleteAccount(
    db,
    session.user.id,
    body.confirm ?? "",
    session.user.email,
  );
  return NextResponse.json(result.body, { status: result.status });
}
