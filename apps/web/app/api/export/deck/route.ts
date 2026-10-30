import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  buildDeckTsv, buildLapisTsv, getDeckCards, getLapisExport, lapisNote, parseExportParams,
} from "@/lib/export";

// GET /api/export/deck — the user's mined cards as an Anki-importable TSV.
//   ?preset=lapis (default) | basic   Lapis note type fields, or the legacy 4 columns
//   ?filter=all (default) | curated   curated = everything outside the curation queue
//   ?deck=<name>                      `#deck:` header (Lapis; default "Fuchine")
//   ?history=1                        FSRS state as `fuchine::…` tags (Lapis); the
//                                     review history itself is /api/export/history
//   ?format=json                      Lapis notes as JSON, for the AnkiConnect push
// Text only (D2): the clip is a YouTube deep link, never attached media.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "unauthorized" }, 401);
  }

  const parsed = parseExportParams(new URL(req.url).searchParams);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const opts = parsed.value;
  const userId = session.user.id;
  const date = new Date().toISOString().slice(0, 10);

  if (opts.preset === "basic") {
    const tsv = buildDeckTsv(await getDeckCards(db, userId, opts.filter));
    return tsvResponse(tsv, `fuchine-deck-${date}.txt`);
  }

  const { cards, entries } = await getLapisExport(db, userId, opts.filter);
  if (opts.format === "json") {
    const notes = cards.map((c) => lapisNote(c, entries, opts));
    return json({ deck: opts.deck, model: "Lapis", notes }, 200);
  }
  return tsvResponse(buildLapisTsv(cards, entries, opts), `fuchine-lapis-${date}.txt`);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function tsvResponse(tsv: string, filename: string): Response {
  return new Response(tsv, {
    status: 200,
    headers: {
      "content-type": "text/tab-separated-values; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
