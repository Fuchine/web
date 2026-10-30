/**
 * Explore scaling bench (T3.10). Builds a synthetic catalog in the database at
 * $DATABASE_URL — by default 2,000 videos × 300 lines (≈ 8 coverage tokens per
 * line, Zipf-like over 20,000 ranked words) — plus one learner who knows the
 * ~3,000 most frequent words, and times:
 *
 *   A. the naive per-request approach: coverage of the WHOLE catalog for the
 *      user (getComprehensionByVideo over every video id);
 *   B. the background materialization: refreshUserVideoCoverage (one INSERT …
 *      SELECT over video_word_counts);
 *   C. an Explore request on a fresh materialization (getExplore: candidate
 *      pre-filter + exact coverage of the shown page);
 *   D. i+1 detection for one 300-line player page (getIPlusOneLines).
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/bench-explore.ts \
 *     [--videos 2000] [--lines 300] [--runs 5] [--keep]
 *
 * Writes only rows tagged "bench-explore-*" and deletes them at the end
 * (unless --keep). Numbers go into docs/plans/2026-10-30-explore-spec.md.
 */
import { eq, like, sql } from "drizzle-orm";
import {
  createDb,
  refreshUserVideoCoverage,
  subtitleLines,
  users,
  videos,
  wordEntries,
  type Database,
  type Token,
} from "@fuchine/db";
import { getComprehensionByVideo } from "../lib/study";
import { getExplore } from "../lib/explore";
import { getIPlusOneLines } from "../lib/i-plus-one";
import { DEFAULT_BAND } from "../lib/explore-rank";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const VIDEOS = arg("videos", 2000);
const LINES = arg("lines", 300);
const RUNS = arg("runs", 5);
const TOKENS_PER_LINE = 8;
const WORDS = 20_000;
const KNOWN = 3_000;
const keep = process.argv.includes("--keep");
const TAG = "bench-explore";

const db = createDb(url, { max: 4 }) as Database;

async function time<T>(label: string, fn: () => Promise<T>, runs = RUNS): Promise<{ median: number; result: T }> {
  const ms: number[] = [];
  let result!: T;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    result = await fn();
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)]!;
  console.log(`  ${label.padEnd(58)} median ${median.toFixed(1).padStart(8)} ms  (min ${ms[0]!.toFixed(1)}, max ${ms[ms.length - 1]!.toFixed(1)}, n=${runs})`);
  return { median, result };
}

async function cleanup() {
  await db.delete(videos).where(like(videos.sourceId, `${TAG}-%`));
  await db.delete(users).where(like(users.email, `${TAG}-%`));
  await db.delete(wordEntries).where(like(wordEntries.lemma, `${TAG}-%`));
}

async function main() {
  console.log(`\n=== Explore bench: ${VIDEOS} videos × ${LINES} lines × ${TOKENS_PER_LINE} tokens, ${WORDS} words ===\n`);
  await cleanup();
  const t0 = performance.now();

  // Dictionary: ranked words; rank = frequency order.
  await db.execute(sql`
    insert into ${wordEntries} ("language", "lemma", "reading", "pos", "definitions", "frequency_rank")
    select 'ja', ${TAG} || '-' || g, 'r' || g, 'n', '[]'::jsonb, g from generate_series(1, ${WORDS}) g`);
  // Catalog.
  await db.execute(sql`
    insert into ${videos} ("source", "source_id", "url", "title", "channel", "duration_s", "language", "status", "created_at")
    select 'youtube', ${TAG} || '-' || g, 'https://youtu.be/x', 'Bench video ' || g, 'Bench channel ' || (g % 50), 900, 'ja', 'done',
      now() - (g || ' minutes')::interval
    from generate_series(1, ${VIDEOS}) g`);
  // Per-video word counts: Zipf-like draws (rank = ceil(W · u^14): the top 3,000 words cover ~87% of tokens, as in real Japanese), grouped.
  await db.execute(sql`
    insert into "video_word_counts" ("video_id", "word_entry_id", "occurrences")
    select d.video_id, w.id, d.n from (
      select v.id as video_id, (1 + floor(${WORDS} * power(random(), 14)))::int as rank, count(*)::int as n
      from ${videos} v, generate_series(1, ${LINES * TOKENS_PER_LINE}) t
      where v.source_id like ${TAG + "-%"}
      group by 1, 2
    ) d join ${wordEntries} w on w.lemma = ${TAG} || '-' || d.rank`);
  // The learner: top KNOWN words — the top third confirmed by reviews, the rest likely by views.
  const [user] = await db.insert(users).values({ email: `${TAG}-${Date.now()}@example.com` }).returning();
  await db.execute(sql`
    insert into "user_word_stats" ("user_id", "word_entry_id", "views", "clicks", "reviews_ok", "reviews_total", "last_review_ok")
    select ${user!.id}::uuid, w.id, 30, 0,
      case when w.frequency_rank <= ${KNOWN / 3} then 1 else 0 end,
      case when w.frequency_rank <= ${KNOWN / 3} then 1 else 0 end,
      case when w.frequency_rank <= ${KNOWN / 3} then true else null end
    from ${wordEntries} w where w.lemma like ${TAG + "-%"} and w.frequency_rank <= ${KNOWN}`);
  // One player page of real lines (tokens jsonb) for the i+1 timing.
  const [first] = await db.select({ id: videos.id }).from(videos).where(eq(videos.sourceId, `${TAG}-1`));
  const ids = await db.select({ id: wordEntries.id, rank: wordEntries.frequencyRank }).from(wordEntries).where(like(wordEntries.lemma, `${TAG}-%`));
  const byRank = new Map(ids.map((w) => [w.rank!, w.id]));
  const lines = Array.from({ length: LINES }, (_, i) => ({
    videoId: first!.id, idx: i, tStartMs: i * 3000, tEndMs: i * 3000 + 2500, textOriginal: `line ${i}`,
    tokens: Array.from({ length: TOKENS_PER_LINE }, (): Token => {
      const rank = 1 + Math.floor(WORDS * Math.random() ** 14);
      return { surface: `語${rank}`, lemma: `語${rank}`, reading: null, romaji: null, pos: "名詞", wordEntryId: byRank.get(rank)! };
    }),
  }));
  await db.insert(subtitleLines).values(lines);
  await db.execute(sql`analyze`);
  const [{ n: vwc }] = (await db.execute(sql`select count(*)::int as n from "video_word_counts" c join ${videos} v on v.id = c.video_id where v.source_id like ${TAG + "-%"}`)) as unknown as { n: number }[];
  console.log(`  setup: ${vwc} video_word_counts rows (${(vwc / VIDEOS).toFixed(0)} distinct words/video) in ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);

  const all = (await db.select({ id: videos.id }).from(videos).where(like(videos.sourceId, `${TAG}-%`))).map((v) => v.id);
  const uid = user!.id;

  const naive = await time("A. naive: whole-catalog coverage per request", () => getComprehensionByVideo(db, uid, all), Math.min(RUNS, 3));
  const refresh = await time("B. refreshUserVideoCoverage (background, whole catalog)", () => refreshUserVideoCoverage(db, uid), Math.min(RUNS, 3));
  const explore = await time("C. Explore request (pre-filter + exact top 24)", () => getExplore(db, uid, { band: DEFAULT_BAND }));
  const shared = await db.select({ id: subtitleLines.id, tokens: subtitleLines.tokens }).from(subtitleLines).where(eq(subtitleLines.videoId, first!.id));
  const ip1 = await time(`D. i+1 for one ${LINES}-line player page`, () => getIPlusOneLines(db, uid, shared.map((l) => ({ id: l.id, tokens: l.tokens ?? [] })), "ja"));

  const top = explore.result.items.slice(0, 3).map((i) => `${i.coverage.headline}% ${i.reason}`);
  console.log(`\n  naive covered ${naive.result.size} videos; materialized ${refresh.result.videos}; Explore returned ${explore.result.items.length} (top: ${top.join(" | ")}); i+1 lines: ${ip1.result.size}/${LINES}`);
  console.log(`  speed-up per request vs naive: ×${(naive.median / explore.median).toFixed(0)}\n`);

  if (!keep) await cleanup();
}

main()
  .catch((err) => { console.error("bench failed:", err); process.exitCode = 1; })
  .finally(async () => {
    const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
    await anyDb.$client?.end?.();
  });
