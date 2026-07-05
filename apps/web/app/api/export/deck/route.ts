import { auth } from "@/auth";
import { db } from "@/lib/db";
import { buildDeckTsv, getDeckCards } from "@/lib/export";

// GET /api/export/deck — the user's mined cards as an Anki-importable TSV.
// Text only (D2): the clip is a YouTube deep link, never attached media.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const cards = await getDeckCards(db, session.user.id);
  const tsv = buildDeckTsv(cards);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(tsv, {
    status: 200,
    headers: {
      "content-type": "text/tab-separated-values; charset=utf-8",
      "content-disposition": `attachment; filename="fuchine-deck-${date}.txt"`,
    },
  });
}
