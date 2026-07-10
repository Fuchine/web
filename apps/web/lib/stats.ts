// Stats read-side aggregation (T2.x). Auth-agnostic and testable; the route adds
// auth. Aggregates directly from the source tables: review_logs, sentence_cards
// and videos for review/mining activity, and user_daily_stats (written by the
// player's progress beacon since 2026-07-04) for watch time and immersion days.
// A day counts as "active" for streaks/heatmap on any activity — a review, a
// mined card, OR immersion (watch time / lines seen) — so a pure-immersion day
// (watching without reviewing), the product's core behavior, keeps the streak.

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

/** Total watch hours over the last 7 local days, from daily-stats rows (rounded to 0.1h). */
export function watchHoursLast7(
  dailyRows: { day: string; ms: number }[],
  today: Date = new Date(),
): number {
  let totalMs = 0;
  for (const r of dailyRows) {
    const k = daysAgo(parseDayKey(r.day), today);
    if (k >= 0 && k < 7) totalMs += r.ms;
  }
  return Math.round((totalMs / 3_600_000) * 10) / 10;
}

export interface LibraryKpis {
  watchTimeHours: number;
  videoCount: number;
  wordsKnown: number;
  dayStreak: number;
}

/**
 * Lean KPIs for the library StatBar — only the numbers it renders. Three cheap
 * queries (total video count, state=2 card count, one row per active day from
 * user_daily_stats) instead of the ~6 in getStats (retention, heatmap review
 * scan, top-sources join…), which the library was paying for on every load.
 * See backlog: library-dashboard-overfetch (part 3).
 */
export async function getLibraryKpis(db: Database, userId: string): Promise<LibraryKpis> {
  const [videoCountRow] = await db
    .select({ n: count() })
    .from(videos);

  const [known] = await db
    .select({ n: count() })
    .from(sentenceCards)
    .where(and(eq(sentenceCards.userId, userId), eq(sentenceCards.state, 2)));

  const dailyRows = await db
    .select({
      day: userDailyStats.day,
      ms: userDailyStats.msWatched,
      lines: userDailyStats.linesSeen,
      cards: userDailyStats.cardsCreated,
      reviews: userDailyStats.reviewsDone,
    })
    .from(userDailyStats)
    .where(eq(userDailyStats.userId, userId));

  // Same active-day definition as getStats: any review, mined card, or immersion.
  const activeKeys = dailyRows
    .filter((r) => r.ms > 0 || r.lines > 0 || r.cards > 0 || r.reviews > 0)
    .map((r) => r.day);
  const { current: dayStreak } = computeStreaks(activeKeys);

  return {
    watchTimeHours: watchHoursLast7(dailyRows),
    videoCount: Number(videoCountRow?.n ?? 0),
    wordsKnown: Number(known?.n ?? 0),
    dayStreak,
  };
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

  // --- Daily activity from user_daily_stats — one row per active day (PK
  // (user_id, day)), full history but O(active days), not O(review history).
  // Every kind of activity (review, mining, watch time, lines seen) is bumped
  // here by the writers, so this single query is the source of truth for both
  // immersion and streaks — no unbounded scan of review_logs/sentence_cards. ---
  const dailyRows = await db
    .select({
      day: userDailyStats.day,
      ms: userDailyStats.msWatched,
      lines: userDailyStats.linesSeen,
      cards: userDailyStats.cardsCreated,
      reviews: userDailyStats.reviewsDone,
    })
    .from(userDailyStats)
    .where(eq(userDailyStats.userId, userId));

  // Active days for streaks: any day with a review, a mined card, OR immersion
  // (watching without reviewing still keeps the streak). All recorded per day.
  const activeKeys = dailyRows
    .filter((r) => r.ms > 0 || r.lines > 0 || r.cards > 0 || r.reviews > 0)
    .map((r) => r.day); // stored as local YYYY-MM-DD keys
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
  // Active-but-no-review days (immersion or pure mining) show at level 1, so the
  // heatmap floor matches the streak's definition of an active day.
  const immersionOffsets = new Set<number>();
  for (const r of dailyRows) {
    if (r.ms <= 0 && r.lines <= 0 && r.cards <= 0 && r.reviews <= 0) continue;
    const k = daysAgo(parseDayKey(r.day), today);
    if (k >= 0 && k < heatmapDays) immersionOffsets.add(k);
  }
  // Build columns oldest→newest; each column is a Mon→Sun week aligned to today's weekday.
  const heatmap: number[][] = [];
  const todayDow = (today.getDay() + 6) % 7; // 0 = Monday
  for (let c = 0; c < HEATMAP_WEEKS; c++) {
    const col: number[] = [];
    for (let r = 0; r < 7; r++) {
      // Offset from today for cell (column c, row r), newest column on the right.
      const offset = (HEATMAP_WEEKS - 1 - c) * 7 + (todayDow - r);
      if (offset < 0) {
        col.push(0);
      } else {
        const lvl = heatLevel(perDay.get(offset) ?? 0);
        col.push(Math.max(lvl, immersionOffsets.has(offset) ? 1 : 0));
      }
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

  // --- Watch time (last 7 days) from the already-fetched daily rows. ---
  const msByDay = new Map<number, number>();
  for (const r of dailyRows) {
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
      watchTimeHours: watchHoursLast7(dailyRows, today),
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
