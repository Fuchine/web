// Phrases read-side query (mined sentence cards). Auth-agnostic; routes add auth.

import { and, asc, count, desc, eq, gt, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { type Database, sentenceCards, subtitleLines, videos } from "@fuchine/db";
import { decodeListCursor, encodeListCursor, escapeLike } from "./list-query";

export type PhraseRow = {
  cardId: string;
  state: number;       // FSRS: 0 New · 1 Learning · 2 Review · 3 Relearning
  due: Date;
  createdAt: Date;
  textOriginal: string;
  textTranslation: string | null;
  tStartMs: number;
  videoId: string;
  videoTitle: string;
  sourceId: string;
  source: string;
};

export const PHRASE_SORTS = ["recent", "oldest", "az", "status"] as const;
export type PhraseSort = (typeof PHRASE_SORTS)[number];

export const PHRASE_STATUSES = ["due", "learning", "new", "known"] as const;
export type PhraseStatus = (typeof PHRASE_STATUSES)[number];

// Display order of the status groups (due first). Mirrors the client's
// STATUS_ORDER and deriveStatus in phrases-view.
const STATUS_RANK: Record<PhraseStatus, number> = { due: 0, learning: 1, new: 2, known: 3 };

/** FSRS state + due → status group rank. Pure TS mirror of rankExpr — the
 * cursor needs the last row's rank without re-asking the database. */
export function phraseRank(state: number, due: Date, now: Date): number {
  if (state === 2 && due <= now) return STATUS_RANK.due;
  if (state === 1 || state === 3) return STATUS_RANK.learning;
  if (state === 0) return STATUS_RANK.new;
  return STATUS_RANK.known;
}

// Rank constants go in as raw literals, not bind params: a CASE whose branches
// are all untyped parameters leaves Postgres unable to infer its type.
const rankExpr = (now: Date) => sql<number>`case
  when ${sentenceCards.state} = 2 and ${sentenceCards.due} <= ${now} then ${sql.raw(String(STATUS_RANK.due))}
  when ${sentenceCards.state} in (1, 3) then ${sql.raw(String(STATUS_RANK.learning))}
  when ${sentenceCards.state} = 0 then ${sql.raw(String(STATUS_RANK.new))}
  else ${sql.raw(String(STATUS_RANK.known))}
end`;

/**
 * Mined phrases for a user (paginated). Search, status filter and sort run
 * here, over the user's whole set — infinite-scroll pages already match. The
 * "status" sort freezes `now` in the cursor so a card can't flip due↔known
 * between pages of one scroll session.
 */
export async function listPhrases(
  db: Database,
  userId: string,
  opts: {
    limit?: number;
    cursor?: string;
    q?: string;
    status?: PhraseStatus;
    sort?: PhraseSort;
  } = {},
): Promise<{ items: PhraseRow[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 50;
  const sort: PhraseSort = opts.sort ?? "recent";

  const decoded = opts.cursor ? decodeListCursor(opts.cursor) : null;
  const now =
    sort === "status" && typeof decoded?.[3] === "number"
      ? new Date(decoded[3])
      : new Date();
  const rank = rankExpr(now);

  const conditions: SQL[] = [eq(sentenceCards.userId, userId)];
  const q = opts.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      or(
        ilike(subtitleLines.textOriginal, pattern),
        ilike(subtitleLines.textTranslation, pattern),
        ilike(videos.title, pattern),
      )!,
    );
  }
  if (opts.status) conditions.push(sql`${rank} = ${STATUS_RANK[opts.status]}`);

  if (opts.cursor) {
    if (sort === "recent") {
      const parts = opts.cursor.split(":");
      const ts = parseInt(parts[1] ?? "", 10);
      const id = parts.slice(2).join(":");
      if (!isNaN(ts) && id) {
        conditions.push(
          or(
            lt(sentenceCards.createdAt, new Date(ts)),
            and(eq(sentenceCards.createdAt, new Date(ts)), lt(sentenceCards.id, id)),
          )!,
        );
      }
    } else if (sort === "oldest") {
      const ts = typeof decoded?.[0] === "number" ? decoded[0] : null;
      const id = typeof decoded?.[1] === "string" ? decoded[1] : null;
      if (ts !== null && id) {
        conditions.push(
          or(
            gt(sentenceCards.createdAt, new Date(ts)),
            and(eq(sentenceCards.createdAt, new Date(ts)), gt(sentenceCards.id, id)),
          )!,
        );
      }
    } else if (sort === "az") {
      const text = typeof decoded?.[0] === "string" ? decoded[0] : null;
      const id = typeof decoded?.[1] === "string" ? decoded[1] : null;
      if (text !== null && id) {
        conditions.push(
          or(
            sql`${subtitleLines.textOriginal} > ${text}`,
            and(sql`${subtitleLines.textOriginal} = ${text}`, gt(sentenceCards.id, id)),
          )!,
        );
      }
    } else {
      const r = typeof decoded?.[0] === "number" ? decoded[0] : null;
      const ts = typeof decoded?.[1] === "number" ? decoded[1] : null;
      const id = typeof decoded?.[2] === "string" ? decoded[2] : null;
      if (r !== null && ts !== null && id) {
        conditions.push(
          or(
            sql`${rank} > ${r}`,
            and(
              sql`${rank} = ${r}`,
              or(
                lt(sentenceCards.createdAt, new Date(ts)),
                and(eq(sentenceCards.createdAt, new Date(ts)), lt(sentenceCards.id, id)),
              ),
            ),
          )!,
        );
      }
    }
  }

  const orderBy =
    sort === "oldest"
      ? [asc(sentenceCards.createdAt), asc(sentenceCards.id)]
      : sort === "az"
        ? [asc(subtitleLines.textOriginal), asc(sentenceCards.id)]
        : sort === "status"
          ? [asc(rank), desc(sentenceCards.createdAt), desc(sentenceCards.id)]
          : [desc(sentenceCards.createdAt), desc(sentenceCards.id)];

  const rows = await db
    .select({
      cardId: sentenceCards.id,
      state: sentenceCards.state,
      due: sentenceCards.due,
      createdAt: sentenceCards.createdAt,
      textOriginal: subtitleLines.textOriginal,
      textTranslation: subtitleLines.textTranslation,
      tStartMs: subtitleLines.tStartMs,
      videoId: videos.id,
      videoTitle: videos.title,
      sourceId: videos.sourceId,
      source: videos.source,
    })
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit) as PhraseRow[];
  const last = items[items.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      sort === "oldest"
        ? encodeListCursor([last.createdAt.getTime(), last.cardId])
        : sort === "az"
          ? encodeListCursor([last.textOriginal, last.cardId])
          : sort === "status"
            ? encodeListCursor([
                phraseRank(last.state, last.due, now),
                last.createdAt.getTime(),
                last.cardId,
                now.getTime(),
              ])
            : `t:${last.createdAt.getTime()}:${last.cardId}`;
  }

  return { items, nextCursor };
}

export type PhraseCounts = { total: number } & Record<PhraseStatus, number>;

/** Real per-status totals for the filter chips (whole set, not loaded pages). */
export async function countPhrasesByStatus(
  db: Database,
  userId: string,
): Promise<PhraseCounts> {
  const rank = rankExpr(new Date());
  const rows = await db
    .select({ rank, n: count() })
    .from(sentenceCards)
    .where(eq(sentenceCards.userId, userId))
    // Positional (`GROUP BY 1`): repeating the CASE would render fresh $n
    // placeholders, and Postgres matches grouped expressions syntactically.
    .groupBy(sql`1`);

  const counts: PhraseCounts = { total: 0, due: 0, learning: 0, new: 0, known: 0 };
  for (const row of rows) {
    const status = PHRASE_STATUSES.find((s) => STATUS_RANK[s] === Number(row.rank));
    if (status) counts[status] = row.n;
    counts.total += row.n;
  }
  return counts;
}
