// Stats read-side aggregation (T2.x). Auth-agnostic and testable; the route adds
// auth. Aggregates directly from the always-populated source tables
// (review_logs, sentence_cards, videos) rather than depending on the pre-aggregated
// user_daily_stats / user_word_stats, which have no writer during normal use yet.
// Only watch time reads user_daily_stats (its rightful source) and degrades to 0.

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  type Database,
  sentenceCards,
  reviewLogs,
  videos,
  userDailyStats,
} from "@fuchine/db";

const DAY_MS = 86_400_000;
const HEATMAP_WEEKS = 17;

export interface StatsKpis {
  wordsKnown: number;
  wordsKnownDelta: number; // cards that reached "known" in the last 7 days
  watchTimeHours: number; // total tracked watch time (0 until the player is instrumented)
  dayStreak: number;
  bestStreak: number;
  retentionPct: number; // last 30 days
}

export interface StatsData {
  kpis: StatsKpis;
  dailyActivityMin: number[]; // last 7 days, minutes watched per day (Mon→Sun order)
  vocab: { known: number; learning: number; new: number };
  heatmap: number[][]; // HEATMAP_WEEKS columns × 7 rows (Mon→Sun), level 0-4
  topSources: { title: string; words: number; durationS: number | null }[];
}

/** FSRS state → coarse vocabulary bucket. 0 New · 1 Learning · 2 Review · 3 Relearning. */
function bucketForState(state: number): "known" | "learning" | "new" {
  if (state === 2) return "known";
  if (state === 1 || state === 3) return "learning";
  return "new";
}

/** Local YYYY-MM-DD key for a date, used to align activity by calendar day. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Parse a YYYY-MM-DD key as a LOCAL midnight date (not UTC — avoids off-by-one in negative-offset zones). */
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Days-since-midnight-today for a date (0 = today, 1 = yesterday, …). */
function daysAgo(d: Date, today: Date): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((a - b) / DAY_MS);
}

/** Longest and current run of consecutive active calendar days (current = ending today or yesterday). */
export function computeStreaks(activeDayKeys: Iterable<string>): {
  current: number;
  best: number;
} {
  const keys = [...new Set(activeDayKeys)].sort(); // ascending YYYY-MM-DD
  if (keys.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i++) {
    const gap = Math.round(
      (parseDayKey(keys[i]).getTime() - parseDayKey(keys[i - 1]).getTime()) / DAY_MS,
    );
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  // Current streak: walk back from the most recent day only if it's today or yesterday.
  const today = new Date();
  const lastGap = daysAgo(parseDayKey(keys[keys.length - 1]), today);
  let current = 0;
  if (lastGap <= 1) {
    current = 1;
    for (let i = keys.length - 2; i >= 0; i--) {
      const gap = Math.round(
        (parseDayKey(keys[i + 1]).getTime() - parseDayKey(keys[i]).getTime()) / DAY_MS,
      );
      if (gap === 1) current++;
      else break;
    }
  }
  return { current, best };
}

/** Bucket a per-day review count into a 0-4 heat level (0 = no activity). */
export function heatLevel(reviews: number): number {
  if (reviews <= 0) return 0;
  if (reviews < 5) return 1;
  if (reviews < 12) return 2;
  if (reviews < 25) return 3;
  return 4;
}

export async function getStats(db: Database, userId: string): Promise<StatsData> {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS);
  const since7 = new Date(now - 7 * DAY_MS);
  const heatmapDays = HEATMAP_WEEKS * 7;
  const sinceHeatmap = new Date(now - heatmapDays * DAY_MS);

  // --- Vocabulary breakdown from FSRS card state (always populated). ---
  const stateRows = await db
    .select({ state: sentenceCards.state, n: count() })
    .from(sentenceCards)
    .where(eq(sentenceCards.userId, userId))
    .groupBy(sentenceCards.state);

  const vocab = { known: 0, learning: 0, new: 0 };
  for (const r of stateRows) vocab[bucketForState(r.state)] += Number(r.n);

  // Cards that reached "known" (Review state) with a review in the last 7 days.
  const [knownDelta] = await db
    .select({ n: count() })
    .from(sentenceCards)
    .where(
      and(
        eq(sentenceCards.userId, userId),
        eq(sentenceCards.state, 2),
        gte(sentenceCards.lastReview, since7),
      ),
    );

  // --- Retention over the last 30 days (grade >= 3 = Good/Easy). ---
  const [ret] = await db
    .select({
      ok: sql<number>`count(*) filter (where ${reviewLogs.grade} >= 3)`,
      total: count(),
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since30)));
  const retTotal = Number(ret?.total ?? 0);
  const retentionPct = retTotal ? Math.round((Number(ret.ok) / retTotal) * 100) : 0;

  // --- Activity days for streaks: any day with a review OR a mined card. ---
  const reviewDayRows = await db
    .select({ reviewedAt: reviewLogs.reviewedAt })
    .from(reviewLogs)
    .where(eq(reviewLogs.userId, userId));
  const cardDayRows = await db
    .select({ createdAt: sentenceCards.createdAt })
    .from(sentenceCards)
    .where(eq(sentenceCards.userId, userId));
  const activeKeys = [
    ...reviewDayRows.map((r) => dayKey(r.reviewedAt)),
    ...cardDayRows.map((r) => dayKey(r.createdAt)),
  ];
  const { current: dayStreak, best: bestStreak } = computeStreaks(activeKeys);

  // --- Review heatmap: reviews per calendar day over the last HEATMAP_WEEKS weeks. ---
  const heatRows = await db
    .select({ reviewedAt: reviewLogs.reviewedAt })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, sinceHeatmap)));
  const perDay = new Map<number, number>(); // daysAgo → count
  const today = new Date();
  for (const r of heatRows) {
    const k = daysAgo(r.reviewedAt, today);
    if (k >= 0 && k < heatmapDays) perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  // Build columns oldest→newest; each column is a Mon→Sun week aligned to today's weekday.
  const heatmap: number[][] = [];
  const todayDow = (today.getDay() + 6) % 7; // 0 = Monday
  for (let c = 0; c < HEATMAP_WEEKS; c++) {
    const col: number[] = [];
    for (let r = 0; r < 7; r++) {
      // Offset from today for cell (column c, row r), newest column on the right.
      const offset = (HEATMAP_WEEKS - 1 - c) * 7 + (todayDow - r);
      col.push(offset < 0 ? 0 : heatLevel(perDay.get(offset) ?? 0));
    }
    heatmap.push(col);
  }

  // --- Top sources by cards mined. ---
  const topRows = await db
    .select({
      title: videos.title,
      durationS: videos.durationS,
      words: count(sentenceCards.id),
    })
    .from(sentenceCards)
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(eq(sentenceCards.userId, userId))
    .groupBy(videos.id)
    .orderBy(desc(count(sentenceCards.id)))
    .limit(5);
  const topSources = topRows.map((r) => ({
    title: r.title,
    words: Number(r.words),
    durationS: r.durationS,
  }));

  // --- Watch time (last 7 days + total) from user_daily_stats. 0 until instrumented. ---
  const watchRows = await db
    .select({ day: userDailyStats.day, ms: userDailyStats.msWatched })
    .from(userDailyStats)
    .where(and(eq(userDailyStats.userId, userId), gte(userDailyStats.day, dayKey(since7))));
  const msByDay = new Map<number, number>();
  let totalMs = 0;
  for (const r of watchRows) {
    totalMs += r.ms;
    const k = daysAgo(parseDayKey(r.day), today);
    if (k >= 0 && k < 7) msByDay.set(k, (msByDay.get(k) ?? 0) + r.ms);
  }
  // Mon→Sun order for the current week's 7 columns.
  const dailyActivityMin: number[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const offset = todayDow - dow;
    dailyActivityMin.push(offset < 0 ? 0 : Math.round((msByDay.get(offset) ?? 0) / 60000));
  }

  return {
    kpis: {
      wordsKnown: vocab.known,
      wordsKnownDelta: Number(knownDelta?.n ?? 0),
      watchTimeHours: Math.round((totalMs / 3_600_000) * 10) / 10,
      dayStreak,
      bestStreak,
      retentionPct,
    },
    dailyActivityMin,
    vocab,
    heatmap,
    topSources,
  };
}
