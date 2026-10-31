import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { dictionaries } from "@fuchine/db";
import { deleteDictionary } from "@fuchine/db/dictionaries";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { adminDenial } from "@/lib/admin";
import { isUuid } from "@/lib/ids";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/dictionaries/:id — { enabled: boolean }: the instance-wide
// switch; a disabled dictionary is hidden from every user (T3.4).
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = adminDenial(await auth());
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Expected { enabled: boolean }." }, { status: 400 });
  }
  const rows = await db
    .update(dictionaries)
    .set({ enabled: body.enabled })
    .where(eq(dictionaries.id, id))
    .returning({ id: dictionaries.id, enabled: dictionaries.enabled });
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// DELETE /api/admin/dictionaries/:id — remove it and (cascade) all its rows.
export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = adminDenial(await auth());
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const { id } = await params;
  if (!isUuid(id) || !(await deleteDictionary(db, id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
