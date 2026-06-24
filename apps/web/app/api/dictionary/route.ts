import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { lookupById, searchDictionary, searchByGloss, detectMode } from "@/lib/dictionary";

// GET /api/dictionary?id=UUID  (resolved token popup)
//                  ?q=text&lang=ja  (search / unresolved token)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const q = url.searchParams.get("q");
  const lang = url.searchParams.get("lang") || "ja";

  if (id) {
    const entry = await lookupById(db, id);
    if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry });
  }
  if (q) {
    const modeParam = url.searchParams.get("mode");
    const mode = modeParam === "ja" || modeParam === "en" ? modeParam : detectMode(q);
    const entries = mode === "en" ? await searchByGloss(db, q, lang) : await searchDictionary(db, q, lang);
    return NextResponse.json({ entries });
  }
  return NextResponse.json({ error: "id or q is required" }, { status: 400 });
}
