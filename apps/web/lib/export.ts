// Deck export (backlog: anki-export). Builds an Anki-importable TSV from the
// user's mined cards. Text only — D2 forbids storing audio/video, so the clip
// ships as a YouTube deep link with a timestamp, never an attached media file.
// buildDeckTsv is pure and unit-tested; the route does auth + the DB read.

import { asc, eq } from "drizzle-orm";
import { type Database, sentenceCards, subtitleLines, videos } from "@fuchine/db";

export type DeckCard = {
  text: string; // JP sentence (front)
  translation: string | null;
  notes: string | null;
  source: string; // e.g. "youtube"
  sourceId: string;
  startMs: number;
};

/** Deep link back to the clip's start (D2: link, never attached media). */
export function clipUrl(source: string, sourceId: string, startMs: number): string {
  const t = Math.max(0, Math.floor(startMs / 1000));
  if (source === "youtube") {
    return `https://www.youtube.com/watch?v=${sourceId}&t=${t}s`;
  }
  return "";
}

/** Flatten a field for TSV: tabs → spaces, newlines → <br> (Anki renders HTML). */
function cell(v: string | null | undefined): string {
  return (v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
}

/**
 * Build an Anki-importable TSV. Columns: Expression, Meaning, Notes, Source.
 * The `#`-directive header tells Anki the separator, that fields are HTML, and
 * the column order, so a plain "Import File" maps them without fiddling.
 */
export function buildDeckTsv(cards: DeckCard[]): string {
  const header = ["#separator:tab", "#html:true", "#columns:Expression\tMeaning\tNotes\tSource"];
  const rows = cards.map((c) => {
    const link = clipUrl(c.source, c.sourceId, c.startMs);
    const source = link ? `<a href="${link}">Watch on YouTube</a>` : "";
    return [cell(c.text), cell(c.translation), cell(c.notes), source].join("\t");
  });
  return [...header, ...rows].join("\n") + "\n";
}

/** Load the user's mined cards as export rows, oldest first. */
export async function getDeckCards(db: Database, userId: string): Promise<DeckCard[]> {
  return db
    .select({
      text: subtitleLines.textOriginal,
      translation: subtitleLines.textTranslation,
      notes: sentenceCards.notes,
      source: videos.source,
      sourceId: videos.sourceId,
      startMs: subtitleLines.tStartMs,
    })
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(eq(sentenceCards.userId, userId))
    .orderBy(asc(sentenceCards.createdAt));
}
