// Study read-side queries (F1). Auth-agnostic and testable; routes add auth.

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  type Database,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  userWordStats,
  savedWords,
  tokenOverrides,
  videoWordCounts,
  wordEntries,
  type Token,
} from "@fuchine/db";
import { countCoverageWords } from "@fuchine/nlp";
import { decodeListCursor, encodeListCursor, escapeLike } from "./list-query";
import { isUuid } from "./ids";
import { LEVEL } from "./library";
import { wordStatusFromStats, wordTierSql, type WordStatus } from "./word-status";
import {
  applyCountDeltas,
  coverageFromTierCounts,
  diffCounts,
  emptyTierCounts,
  signalsFromRow,
  type Coverage,
  type TierCounts,
} from "./known-words";
import { withTokenOverrides, type TokenSpan } from "./token-overrides";

export type { Coverage };

// Nulls sort last: videos without a duration on "shortest first", without a
// level estimate on "level". The level bands mirror LEVEL in lib/library.ts.
const DURATION_NULL = 2147483647;
const LEVEL_NULL = 99;

export const VIDEO_SORTS = ["newest", "short", "level"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

/**
 * Library: videos with their line count (paginated). Search, category filter
 * and sort run here, over the whole catalog — the client's infinite scroll
 * only ever sees pages that already match. "Most comprehensible" is NOT a
 * server sort: coverage is a per-user aggregate over video_word_counts
 * (catalog-sized, D3), and ordering by it would recompute it for every video
 * on every page; the client keeps that ordering over loaded pages.
 * `total` (count under the same filters) comes only with the first page.
 */
export async function listVideos(
  db: Database,
  opts: {
    limit?: number;
    cursor?: string;
    q?: string;
    category?: string;
    sort?: VideoSort;
  } = {},
) {
  const limit = opts.limit ?? 24;
  const sort: VideoSort = opts.sort ?? "newest";

  const filters: SQL[] = [];
  const q = opts.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(videos.title, pattern), ilike(videos.channel, pattern))!);
  }
  if (opts.category) filters.push(eq(videos.category, opts.category));

  // Constants go in as raw literals, not bind params: a CASE whose branches
  // are all untyped parameters leaves Postgres unable to infer its type.
  const durationKey = sql<number>`coalesce(${videos.durationS}, ${sql.raw(String(DURATION_NULL))})`;
  const levelKey = sql<number>`case when ${videos.levelEstimate} = 'beginner' then ${sql.raw(String(LEVEL.beginner))} when ${videos.levelEstimate} = 'intermediate' then ${sql.raw(String(LEVEL.intermediate))} when ${videos.levelEstimate} = 'advanced' then ${sql.raw(String(LEVEL.advanced))} else ${sql.raw(String(LEVEL_NULL))} end`;
  const sortKey = sort === "short" ? durationKey : sort === "level" ? levelKey : null;

  const pageConditions = [...filters];
  if (opts.cursor) {
    if (sortKey === null) {
      const parts = opts.cursor.split(":");
      const ts = parseInt(parts[1] ?? "", 10);
      const id = parts.slice(2).join(":");
      if (!isNaN(ts) && isUuid(id)) {
        pageConditions.push(
          or(
            lt(videos.createdAt, new Date(ts)),
            and(eq(videos.createdAt, new Date(ts)), lt(videos.id, id)),
          )!,
        );
      }
    } else {
      const cur = decodeListCursor(opts.cursor);
      const v = typeof cur?.[0] === "number" ? cur[0] : null;
      const id = typeof cur?.[1] === "string" ? cur[1] : null;
      if (v !== null && isUuid(id)) {
        pageConditions.push(
          or(sql`${sortKey} > ${v}`, and(sql`${sortKey} = ${v}`, lt(videos.id, id)))!,
        );
      }
    }
  }

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      channel: videos.channel,
      source: videos.source,
      sourceId: videos.sourceId,
      durationS: videos.durationS,
      language: videos.language,
      status: videos.status,
      statusReason: videos.statusReason,
      levelEstimate: videos.levelEstimate,
      embeddable: videos.embeddable,
      category: videos.category,
      createdAt: videos.createdAt,
      // Columns hand-qualified: in a select projection drizzle renders bare
      // column refs unqualified, so `${videos.id}` here would resolve to the
      // subquery's own `subtitle_lines.id` and the count would always be 0.
      lineCount: sql<number>`(SELECT count(*)::int FROM ${subtitleLines} WHERE ${subtitleLines}."video_id" = ${videos}."id")`,
    })
    .from(videos)
    .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
    .orderBy(
      ...(sortKey === null
        ? [desc(videos.createdAt), desc(videos.id)]
        : [asc(sortKey), desc(videos.id)]),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      sort === "short"
        ? encodeListCursor([last.durationS ?? DURATION_NULL, last.id])
        : sort === "level"
          ? encodeListCursor([LEVEL[last.levelEstimate ?? ""] ?? LEVEL_NULL, last.id])
          : `t:${last.createdAt.getTime()}:${last.id}`;
  }

  let total: number | undefined;
  if (!opts.cursor) {
    const [row] = await db
      .select({ n: count() })
      .from(videos)
      .where(filters.length > 0 ? and(...filters) : undefined);
    total = row?.n ?? 0;
  }

  return { items, nextCursor, total };
}

/** Dashboard "Continue watching": the newest video only, without the line-count join. */
export async function getLatestVideo(db: Database) {
  const [row] = await db
    .select({
      id: videos.id,
      title: videos.title,
      channel: videos.channel,
      source: videos.source,
      sourceId: videos.sourceId,
      durationS: videos.durationS,
    })
    .from(videos)
    .orderBy(desc(videos.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Token-weighted coverage per video for a user (T3.9; replaces the v1
 * distinct-word comprehension). Headline + confidence band + unique-word
 * coverage, from the materialized per-video word frequency (video_word_counts)
 * joined with the user's signals and manual overrides, tiered in SQL by
 * wordTierSql. Videos with too few countable tokens are omitted (no number).
 *
 * Cost per call: ONE aggregate (grouped by video × tier) riding the
 * video_word_counts PK for the given videos and the user_word_stats /
 * saved_words PKs; plus one indexed lookup of the user's token corrections on
 * those videos, and — only when there are some — two small queries for the
 * corrected words. Pass the `videoIds` being rendered: the table is
 * catalog-sized (shared cache, D3). Empty array ⇒ empty map.
 */
export async function getComprehensionByVideo(
  db: Database,
  userId: string,
  videoIds?: string[],
): Promise<Map<string, Coverage>> {
  if (videoIds && videoIds.length === 0) return new Map();
  const rows = await db
    .select({
      videoId: videoWordCounts.videoId,
      tier: wordTierSql,
      tokens: sql<number>`sum(${videoWordCounts.occurrences})::int`,
      words: sql<number>`count(*)::int`,
    })
    .from(videoWordCounts)
    .leftJoin(userWordStats, and(eq(userWordStats.userId, userId), eq(userWordStats.wordEntryId, videoWordCounts.wordEntryId)))
    .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, videoWordCounts.wordEntryId)))
    .where(videoIds ? inArray(videoWordCounts.videoId, videoIds) : undefined)
    .groupBy(videoWordCounts.videoId, wordTierSql);

  const counts = new Map<string, TierCounts>();
  for (const r of rows) {
    const c = counts.get(r.videoId) ?? emptyTierCounts();
    c[r.tier].tokens += Number(r.tokens);
    c[r.tier].words += Number(r.words);
    counts.set(r.videoId, c);
  }

  await applyUserCorrections(db, userId, counts, videoIds);

  const map = new Map<string, Coverage>();
  for (const [videoId, c] of counts) {
    const cov = coverageFromTierCounts(c);
    if (cov) map.set(videoId, cov);
  }
  return map;
}

/**
 * The user's token corrections (T3.7) on these videos, applied to the shared
 * counts as per-word deltas (corrected − original coverage tokens of each
 * corrected line). Corrections are rare, so this is usually one empty lookup.
 */
async function applyUserCorrections(
  db: Database,
  userId: string,
  counts: Map<string, TierCounts>,
  videoIds: string[] | undefined,
): Promise<void> {
  const corrected = await db
    .selectDistinct({ id: subtitleLines.id, videoId: subtitleLines.videoId, tokens: subtitleLines.tokens, language: videos.language })
    .from(tokenOverrides)
    .innerJoin(subtitleLines, eq(subtitleLines.id, tokenOverrides.subtitleLineId))
    .innerJoin(videos, eq(videos.id, subtitleLines.videoId))
    .where(and(
      eq(tokenOverrides.userId, userId),
      videoIds ? inArray(subtitleLines.videoId, videoIds) : undefined,
    ));
  if (corrected.length === 0) return;

  const lines = await withTokenOverrides(db, userId, corrected.map((l) => ({ ...l, original: l.tokens ?? [] })), (l) => l.id);
  const ids = [...new Set(lines.flatMap((l) => [...l.original, ...l.tokens].flatMap((t) => (t.wordEntryId ? [t.wordEntryId] : []))))];
  if (ids.length === 0) return;
  // Entry POS (exclusions) and tier for every word involved, in one query.
  const entries = await db
    .select({ id: wordEntries.id, pos: wordEntries.pos, tier: wordTierSql })
    .from(wordEntries)
    .leftJoin(userWordStats, and(eq(userWordStats.userId, userId), eq(userWordStats.wordEntryId, wordEntries.id)))
    .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, wordEntries.id)))
    .where(inArray(wordEntries.id, ids));
  const entryPos = new Map(entries.map((e) => [e.id, e.pos]));
  const tiers = new Map(entries.map((e) => [e.id, e.tier]));

  const deltasByVideo = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const d = deltasByVideo.get(l.videoId) ?? new Map<string, number>();
    diffCounts(
      countCoverageWords([l.original], l.language, entryPos),
      countCoverageWords([l.tokens], l.language, entryPos),
      d,
    );
    deltasByVideo.set(l.videoId, d);
  }

  const touched = [...deltasByVideo].flatMap(([videoId, d]) => [...d.keys()].map((w) => ({ videoId, w })));
  const baseRows = touched.length === 0 ? [] : await db
    .select({ videoId: videoWordCounts.videoId, wordEntryId: videoWordCounts.wordEntryId, occurrences: videoWordCounts.occurrences })
    .from(videoWordCounts)
    .where(and(
      inArray(videoWordCounts.videoId, [...deltasByVideo.keys()]),
      inArray(videoWordCounts.wordEntryId, [...new Set(touched.map((t) => t.w))]),
    ));
  for (const [videoId, d] of deltasByVideo) {
    const base = new Map(baseRows.filter((r) => r.videoId === videoId).map((r) => [r.wordEntryId, r.occurrences]));
    const c = counts.get(videoId) ?? emptyTierCounts();
    applyCountDeltas(c, d, base, tiers);
    counts.set(videoId, c);
  }
}

/**
 * Player known-word signals (T3.8/T3.9): color per word for one user over the
 * word ids of the video being opened — one query driven by the word_entries
 * PK with the user's stats and manual override left-joined, tiered by the
 * façade (wordStatusFromStats). Only "seen" (likely) / "known" (confirmed)
 * words are returned — absent means "unknown" — so the payload stays small.
 */
export async function getWordStatuses(
  db: Database,
  userId: string,
  wordEntryIds: readonly string[],
): Promise<Record<string, Exclude<WordStatus, "unknown">>> {
  const ids = [...new Set(wordEntryIds)];
  if (ids.length === 0) return {};
  const rows = await db
    .select({
      wordEntryId: wordEntries.id,
      views: userWordStats.views,
      clicks: userWordStats.clicks,
      reviewsOk: userWordStats.reviewsOk,
      reviewsTotal: userWordStats.reviewsTotal,
      lastReviewOk: userWordStats.lastReviewOk,
      lastClickedAt: userWordStats.lastClickedAt,
      manual: savedWords.status,
    })
    .from(wordEntries)
    .leftJoin(userWordStats, and(eq(userWordStats.userId, userId), eq(userWordStats.wordEntryId, wordEntries.id)))
    .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, wordEntries.id)))
    .where(and(
      inArray(wordEntries.id, ids),
      or(isNotNull(userWordStats.userId), isNotNull(savedWords.status)),
    ));
  const now = new Date();
  const out: Record<string, Exclude<WordStatus, "unknown">> = {};
  for (const r of rows) {
    const status = wordStatusFromStats(signalsFromRow(r), r.manual, now);
    if (status !== "unknown") out[r.wordEntryId] = status;
  }
  return out;
}

/**
 * Player payload: the video plus its ordered subtitle lines (tokens included).
 * With `userId`, the user's token corrections (T3.7) are applied and corrected
 * lines carry `tokenSpans`; other users and the shared row are untouched.
 */
export async function getVideoWithLines(db: Database, videoId: string, opts: { userId?: string } = {}) {
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video) return null;

  const sharedLines = await db
    .select({
      id: subtitleLines.id,
      idx: subtitleLines.idx,
      tStartMs: subtitleLines.tStartMs,
      tEndMs: subtitleLines.tEndMs,
      textOriginal: subtitleLines.textOriginal,
      textTranslation: subtitleLines.textTranslation,
      tokens: subtitleLines.tokens,
    })
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, videoId))
    .orderBy(asc(subtitleLines.idx));
  const lines: (Omit<(typeof sharedLines)[number], "tokens"> & { tokens: Token[]; tokenSpans?: TokenSpan[] })[] = opts.userId
    ? await withTokenOverrides(db, opts.userId, sharedLines, (l) => l.id)
    : sharedLines.map((l) => ({ ...l, tokens: l.tokens ?? [] }));

  const chunks = await db
    .select({ chunkIdx: subtitleTranslationChunks.chunkIdx })
    .from(subtitleTranslationChunks)
    .where(eq(subtitleTranslationChunks.videoId, videoId));

  return { video, lines, translatedChunks: chunks.map((c) => c.chunkIdx) };
}
