// Per-video word frequency for token-weighted coverage (T3.9). Rebuilds the
// video's video_word_counts rows from its shared tokens: delete + insert, so a
// re-import or a backfill re-run converges to the same rows (idempotent).

import { eq, inArray } from "drizzle-orm";
import { type DbOrTx, type Token, videoWordCounts, wordEntries } from "@fuchine/db";
import { countCoverageWords } from "@fuchine/nlp";

const INSERT_CHUNK = 2000;

export async function writeVideoWordCounts(
  db: DbOrTx,
  videoId: string,
  language: string,
  tokenLists: readonly (readonly Token[])[],
): Promise<number> {
  const ids = [...new Set(tokenLists.flatMap((ts) => ts.flatMap((t) => (t.wordEntryId ? [t.wordEntryId] : []))))];
  const entryPos = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
    const rows = await db
      .select({ id: wordEntries.id, pos: wordEntries.pos })
      .from(wordEntries)
      .where(inArray(wordEntries.id, ids.slice(i, i + INSERT_CHUNK)));
    for (const r of rows) entryPos.set(r.id, r.pos);
  }
  const counts = countCoverageWords(tokenLists, language, entryPos);

  await db.delete(videoWordCounts).where(eq(videoWordCounts.videoId, videoId));
  const rows = [...counts].map(([wordEntryId, occurrences]) => ({ videoId, wordEntryId, occurrences }));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(videoWordCounts).values(rows.slice(i, i + INSERT_CHUNK));
  }
  return rows.length;
}
