import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isUuid } from "@/lib/ids";
import { db } from "@/lib/db";
import { revokeApiToken } from "@/lib/api-tokens";

// DELETE /api/tokens/:id — revoke one of the user's API tokens (T2.11).
// Session-only; another user's token id answers 404 like a missing one.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "token not found" }, { status: 404 });
  const result = await revokeApiToken(db, session.user.id, id);
  return NextResponse.json(result.body, { status: result.status });
}
