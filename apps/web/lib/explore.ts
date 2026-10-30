// Explore (T3.10, innovation 1 part 2): the next videos for THIS user, ranked
// by personal coverage near a target band, novelty (unknown common words) and
// narrow viewing (same channel as something watched recently). Ranking math
// is pure in ./explore-rank; this module is the two-stage read:
//
//  1. pre-filter: the user's materialized per-video tier sums
//     (user_video_coverage, refreshed in the background) → ≤ CANDIDATES rows
//     nearest the band center, flagged/watched/≥ 98% videos excluded in SQL;
//  2. exact: the token-weighted coverage of the top `limit` recomputed with
//     the user's token corrections (getComprehensionByVideo), then re-ranked.
//
// Freshness: stale-while-revalidate. The first visit materializes
// synchronously (one aggregate); afterwards a stale table (activity since,
// new videos, or older than STALE_AFTER_MS) enqueues a worker refresh and the
// page serves the previous numbers. Spec + measured costs:
// docs/plans/2026-10-30-explore-spec.md.

import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import {
  type Database,
  refreshUserVideoCoverage,
  savedWords,
  userVideoCoverage,
  userVideoFlags,
  userVideoProgress,
  userWordStats,
  videos,
} from "@fuchine/db";
import { loadKnownWordParams, wordTierSqlFor, COVERAGE_MIN_TOKENS, COVERAGE_MIN_WORDS, type Coverage, type KnownWordParams } from "./known-words";
import { getComprehensionByVideo } from "./study";
import {
  bandCenter,
  explainScore,
  rankCandidates,
  EXCLUDE_COVERED_AT,
  type CoverageBand,
  type ScoreParts,
} from "./explore-rank";
import starter from "./starter-channels.json";

/** Rows read from the materialization per request (nearest the band center). */
export const CANDIDATES = 200;
/** Recompute in the background when the table is older than this… */
export const STALE_AFTER_MS = 6 * 3_600_000;
/** …or on activity since, but not more often than this. */
export const MIN_REFRESH_INTERVAL_MS = 5 * 60_000;
/** Narrow viewing looks at channels watched in this window. */
export const NARROW_WINDOW_DAYS = 30;
/** A video watched this far through counts as watched (excluded). */
export const WATCHED_SHARE = 0.8;
/** Cold start: fewer known (confirmed + likely) words than this… */
export const COLD_START_MIN_KNOWN = 100;
/** …or fewer ranked videos than this ⇒ show the curated starter channels. */
export const COLD_START_MIN_RESULTS = 5;

export type StarterChannel = {
  name: string;
  level: "beginner" | "intermediate" | "advanced";
  note: string;
  /** YouTube search by name: we store names only (no Data API, no fetch). */
  url: string;
};

export function starterChannels(): StarterChannel[] {
  return (starter.channels as Omit<StarterChannel, "url">[]).map((c) => ({
    ...c,
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(c.name)}`,
  }));
}

export type ExploreItem = {
  video: {
    id: string;
    title: string;
    channel: string | null;
    sourceId: string;
    durationS: number | null;
    levelEstimate: string | null;
  };
  coverage: Pick<Coverage, "headline" | "low" | "high" | "unique">;
  newCommonWords: number;
  narrowFrom: string | null;
  parts: ScoreParts;
  reason: string;
};

export type ExploreResult = {
  band: CoverageBand;
  items: ExploreItem[];
  /** A background refresh was requested (numbers may lag recent activity). */
  refreshing: boolean;
  computedAt: Date | null;
  knownWords: number;
  catalogSize: number;
  coldStart: boolean;
  starter: StarterChannel[];
  params: KnownWordParams;
};

export type CoverageFreshness = {
  rows: number;
  computedAt: Date | null;
  /** user_word_stats / saved_words changed, or videos were imported, since. */
  changedSince: boolean;
};

/** Is this user's materialization missing or behind? A few indexed lookups. */
export async function coverageFreshness(db: Database, userId: string): Promise<CoverageFreshness> {
  const [m] = await db
    .select({ rows: sql<number>`count(*)::int`, computedAt: sql<Date | null>`min(${userVideoCoverage.computedAt})` })
    .from(userVideoCoverage)
    .where(eq(userVideoCoverage.userId, userId));
  const rows = Number(m?.rows ?? 0);
  const computedAt = m?.computedAt ? new Date(m.computedAt) : null;
  if (!computedAt) return { rows, computedAt, changedSince: true };
  const [c] = await db.execute<{ changed: boolean }>(sql`
    select (
      exists (select 1 from ${userWordStats} where ${userWordStats.userId} = ${userId} and ${userWordStats.updatedAt} > ${computedAt.toISOString()}::timestamptz)
      or exists (select 1 from ${savedWords} where ${savedWords.userId} = ${userId} and ${savedWords.createdAt} > ${computedAt.toISOString()}::timestamptz)
      or exists (select 1 from ${videos} where ${videos.status} = 'done' and ${videos.createdAt} > ${computedAt.toISOString()}::timestamptz)
    ) as changed
  `) as unknown as { changed: boolean }[];
  return { rows, computedAt, changedSince: Boolean(c?.changed) };
}

/** Pure: what to do with the materialization on this visit. */
export function freshnessAction(f: CoverageFreshness, now: number): "compute" | "refresh" | "fresh" {
  if (f.rows === 0 || !f.computedAt) return "compute";
  const age = now - f.computedAt.getTime();
  if (age < MIN_REFRESH_INTERVAL_MS) return "fresh";
  if (f.changedSince || age > STALE_AFTER_MS) return "refresh";
  return "fresh";
}

/** Known words (confirmed + likely) of a user — the cold-start signal. One aggregate. */
export async function countKnownWords(db: Database, userId: string, params: KnownWordParams): Promise<number> {
  const tier = wordTierSqlFor(params.likelyMinViews);
  const [r] = await db
    .select({ n: sql<number>`count(*) filter (where ${tier} <> 'unknown')::int` })
    .from(userWordStats)
    .leftJoin(savedWords, and(eq(savedWords.userId, userId), eq(savedWords.wordEntryId, userWordStats.wordEntryId)))
    .where(eq(userWordStats.userId, userId));
  const [manual] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedWords)
    .leftJoin(userWordStats, and(eq(userWordStats.userId, userId), eq(userWordStats.wordEntryId, savedWords.wordEntryId)))
    .where(and(eq(savedWords.userId, userId), eq(savedWords.status, "known"), sql`${userWordStats.userId} is null`));
  return Number(r?.n ?? 0) + Number(manual?.n ?? 0);
}

/**
 * Stage 1: the candidates nearest the band center from the materialization,
 * with the exclusions done in SQL (hidden / not interested, watched ≥ 80%,
 * ≥ 98% covered, too few countable tokens). Reads ≤ CANDIDATES rows.
 */
export async function selectCandidates(
  db: Database,
  userId: string,
  band: CoverageBand,
  likelyWeight: number,
  limit = CANDIDATES,
) {
  const w = Number.isFinite(likelyWeight) ? likelyWeight : 0.7;
  const headline = sql<number>`(100.0 * (${userVideoCoverage.confirmedTokens} + ${sql.raw(String(w))} * ${userVideoCoverage.likelyTokens}) / ${userVideoCoverage.tokens})`;
  return db
    .select({
      videoId: userVideoCoverage.videoId,
      headline: sql<number>`${headline}::float8`,
      newCommonWords: userVideoCoverage.newCommonWords,
      channel: videos.channel,
    })
    .from(userVideoCoverage)
    .innerJoin(videos, and(eq(videos.id, userVideoCoverage.videoId), eq(videos.status, "done")))
    .where(and(
      eq(userVideoCoverage.userId, userId),
      sql`${userVideoCoverage.tokens} >= ${sql.raw(String(COVERAGE_MIN_TOKENS))}`,
      sql`${userVideoCoverage.words} >= ${sql.raw(String(COVERAGE_MIN_WORDS))}`,
      sql`${headline} < ${sql.raw(String(EXCLUDE_COVERED_AT - 0.5))}`,
      sql`not exists (select 1 from ${userVideoFlags} where ${userVideoFlags.userId} = ${userId}
        and ${userVideoFlags.videoId} = ${userVideoCoverage.videoId} and ${userVideoFlags.flag} in ('hidden', 'not_interested'))`,
      sql`not exists (select 1 from ${userVideoProgress} where ${userVideoProgress.userId} = ${userId}
        and ${userVideoProgress.videoId} = ${userVideoCoverage.videoId}
        and ${videos.durationS} is not null and ${userVideoProgress.msWatched} >= ${sql.raw(String(WATCHED_SHARE))} * ${videos.durationS} * 1000)`,
    ))
    .orderBy(sql`abs(${headline} - ${sql.raw(String(bandCenter(band)))})`, userVideoCoverage.videoId)
    .limit(limit);
}

/** channel → title of the most recently watched video of it (narrow viewing). */
export async function recentChannels(db: Database, userId: string, now = new Date()): Promise<Map<string, string>> {
  const since = new Date(now.getTime() - NARROW_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({ channel: videos.channel, title: videos.title, at: userVideoProgress.lastWatchedAt })
    .from(userVideoProgress)
    .innerJoin(videos, eq(videos.id, userVideoProgress.videoId))
    .where(and(eq(userVideoProgress.userId, userId), gt(userVideoProgress.lastWatchedAt, since), isNotNull(videos.channel)))
    .orderBy(desc(userVideoProgress.lastWatchedAt))
    .limit(50);
  const out = new Map<string, string>();
  for (const r of rows) if (r.channel && !out.has(r.channel)) out.set(r.channel, r.title);
  return out;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The Explore page payload. `onStale` is called when the materialization
 * should be refreshed in the background (the route passes the worker enqueue).
 */
export async function getExplore(
  db: Database,
  userId: string,
  opts: { band: CoverageBand; limit?: number; now?: Date; onStale?: (userId: string) => void },
): Promise<ExploreResult> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 24;
  const params = await loadKnownWordParams(db, userId);

  const fresh = await coverageFreshness(db, userId);
  const action = freshnessAction(fresh, now.getTime());
  let computedAt = fresh.computedAt;
  let refreshing = false;
  if (action === "compute") {
    await refreshUserVideoCoverage(db, userId, { minViews: params.likelyMinViews, now });
    computedAt = now;
  } else if (action === "refresh" && opts.onStale) {
    opts.onStale(userId);
    refreshing = true;
  }

  const [candidates, narrow, knownWords, [catalog]] = await Promise.all([
    selectCandidates(db, userId, opts.band, params.likelyWeight),
    recentChannels(db, userId, now),
    countKnownWords(db, userId, params),
    db.select({ n: sql<number>`count(*)::int` }).from(videos).where(eq(videos.status, "done")),
  ]);

  const toInput = (c: { videoId: string; headline: number; newCommonWords: number; channel: string | null }, coverage: number) => {
    const from = c.channel ? narrow.get(c.channel) : undefined;
    return { videoId: c.videoId, coverage, newCommonWords: c.newCommonWords, narrowFrom: from ? truncate(from, 48) : null };
  };
  // Stage 1 rank on the materialized numbers; keep a margin for stage 2 drops.
  const pre = rankCandidates(candidates.map((c) => toInput(c, Number(c.headline))), opts.band).slice(0, limit + 8);
  const byId = new Map(candidates.map((c) => [c.videoId, c]));

  // Stage 2: exact coverage (token corrections applied) for the shown page.
  const ids = pre.map((p) => p.videoId);
  const exact = await getComprehensionByVideo(db, userId, ids, params);
  const ranked = rankCandidates(
    pre.flatMap((p) => {
      const cov = exact.get(p.videoId);
      return cov ? [{ ...toInput(byId.get(p.videoId)!, cov.headline), cov }] : [];
    }),
    opts.band,
  ).slice(0, limit);

  const meta = ranked.length === 0 ? [] : await db
    .select({
      id: videos.id, title: videos.title, channel: videos.channel, sourceId: videos.sourceId,
      durationS: videos.durationS, levelEstimate: videos.levelEstimate,
    })
    .from(videos)
    .where(inArray(videos.id, ranked.map((r) => r.videoId)));
  const metaById = new Map(meta.map((m) => [m.id, m]));

  const items: ExploreItem[] = ranked.flatMap((r) => {
    const v = metaById.get(r.videoId);
    if (!v) return [];
    return [{
      video: v,
      coverage: { headline: r.cov.headline, low: r.cov.low, high: r.cov.high, unique: r.cov.unique },
      newCommonWords: r.newCommonWords,
      narrowFrom: r.narrowFrom,
      parts: r.parts,
      reason: explainScore(r),
    }];
  });

  const catalogSize = Number(catalog?.n ?? 0);
  const coldStart = knownWords < COLD_START_MIN_KNOWN || items.length < COLD_START_MIN_RESULTS;
  return {
    band: opts.band,
    items,
    refreshing,
    computedAt,
    knownWords,
    catalogSize,
    coldStart,
    starter: coldStart ? starterChannels() : [],
    params,
  };
}
