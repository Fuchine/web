import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { savedWords, userWordStats, wordEntries } from "@fuchine/db";
import { freqTier } from "@/lib/dictionary";
import { computeMastery, firstGloss, grammarPosCondition } from "@/lib/dictionary-utils";
import { escapeLike, parseLimit } from "@/lib/list-query";
import { isUuid } from "@/lib/ids";
import { enforceRateLimit, tooManyRequests, retryAfterHeader } from "@/lib/rate-limit";

export type BrowseItem = {
  id: string;
  w: string;
  r: string | null;
  pos: string | null;
  def: string;
  freq: number;
  saved: boolean;
  m: number[];
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = parseLimit(url.searchParams.get("limit"), 50);
  // Capped (C3): an unbounded q was an unbounded ILIKE pattern.
  const search = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const grammarOnly = url.searchParams.get("grammar") === "true";
  const posFilter = url.searchParams.get("pos"); // comma-separated JMdict POS tags

  // Build base conditions (shared between data query and count query)
  const baseConditions = [eq(wordEntries.language, "ja")];

  if (search) {
    // The ILIKE over lemma/reading has no trigram index (seq scan), so text
    // searches share the dictionary search limit; plain browsing doesn't count.
    const rl = await enforceRateLimit("dictionarySearch", userId);
    if (!rl.ok) {
      const denied = tooManyRequests(rl, "Too many searches — slow down a moment.");
      return NextResponse.json(denied.body, {
        status: denied.status,
        headers: retryAfterHeader(denied),
      });
    }
    // Escaped so % and _ match literally instead of acting as wildcards.
    const like = `%${escapeLike(search)}%`;
    baseConditions.push(
      sql`(${wordEntries.lemma} ILIKE ${like} OR ${wordEntries.reading} ILIKE ${like})`,
    );
  }

  if (grammarOnly) {
    baseConditions.push(grammarPosCondition(wordEntries.pos));
  }

  if (posFilter) {
    const tags = posFilter.split(",").filter(Boolean);
    if (tags.length > 0) {
      baseConditions.push(sql`string_to_array(${wordEntries.pos}, ',') && ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[]`);
    }
  }

  // Total count (only on first page) — uses base conditions, respects all filters
  let totalCount: number | undefined;
  if (!cursor) {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(wordEntries)
      .where(and(...baseConditions));
    totalCount = Number(row?.count ?? 0);
  }

  // Build paginated conditions (base + cursor)
  const pageConditions = [...baseConditions];

  // Keyset pagination: cursor = "l:<lemmaLength>:<id>"
  // Ordered by lemma length (short=simple first), then id for tiebreaking.
  if (cursor) {
    if (cursor.startsWith("l:")) {
      const parts = cursor.slice(2).split(":");
      const len = parseInt(parts[0]!, 10);
      const idStr = parts.slice(1).join(":");
      if (!isNaN(len) && isUuid(idStr)) {
        pageConditions.push(
          or(
            sql`LENGTH(${wordEntries.lemma}) < ${len}`,
            and(
              sql`LENGTH(${wordEntries.lemma}) = ${len}`,
              gt(wordEntries.id, idStr),
            )!,
          )!,
        );
      }
    }
  }

  // Query 1: fetch word entries page (no JOINs — fast index scan)
  const pageRows = await db
    .select({
      id: wordEntries.id,
      lemma: wordEntries.lemma,
      reading: wordEntries.reading,
      pos: wordEntries.pos,
      definitions: wordEntries.definitions,
      frequencyRank: wordEntries.frequencyRank,
    })
    .from(wordEntries)
    .where(and(...pageConditions))
    .orderBy(sql`LENGTH(${wordEntries.lemma}) ASC`, asc(wordEntries.id))
    .limit(limit + 1);

  const hasMore = pageRows.length > limit;
  const rows = pageRows.slice(0, limit);

  // Query 2: batch-fetch saved status
  const ids = rows.map((r) => r.id);
  const savedRows = ids.length > 0
    ? await db
        .select({ id: savedWords.wordEntryId })
        .from(savedWords)
        .where(and(eq(savedWords.userId, userId), inArray(savedWords.wordEntryId, ids)))
    : [];
  const savedSet = new Set(savedRows.map((r) => r.id));

  // Query 3: batch-fetch user stats
  const statsRows = ids.length > 0
    ? await db
        .select({
          id: userWordStats.wordEntryId,
          reviewsOk: userWordStats.reviewsOk,
          reviewsTotal: userWordStats.reviewsTotal,
        })
        .from(userWordStats)
        .where(and(eq(userWordStats.userId, userId), inArray(userWordStats.wordEntryId, ids)))
    : [];
  const statsMap = new Map(statsRows.map((r) => [r.id, r]));

  const items: BrowseItem[] = rows.map((r) => {
    const saved = savedSet.has(r.id);
    const statsRow = statsMap.get(r.id) ?? null;
    return {
      id: r.id,
      w: r.lemma,
      r: r.reading,
      pos: r.pos,
      def: firstGloss(r.definitions as { glosses: string[] }[]),
      freq: freqTier(r.frequencyRank),
      saved,
      m: computeMastery(
        statsRow ? { reviewsOk: statsRow.reviewsOk, reviewsTotal: statsRow.reviewsTotal } : null,
      ),
    };
  });

  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? `l:${last.lemma.length}:${last.id}` : null;

  return NextResponse.json({ items, nextCursor, hasMore, totalCount });
}
