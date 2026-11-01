/**
 * End-to-end test for the known-word model and token-weighted coverage (T3.9).
 * Runs the REAL writers (worker word counts, review/click writers) and read
 * sides (getComprehensionByVideo, getWordStatuses, albums, calibration)
 * against a live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-comprehension.ts
 */
import {
  createDb, users, videos, subtitleLines, wordEntries, userWordStats, savedWords, videoWordCounts,
  tokenOverrides, albums, albumVideos, sentenceCards, reviewLogs,
  type Database, type Definition, type Token,
} from "@fuchine/db";
import { and, eq, inArray } from "drizzle-orm";
import { getComprehensionByVideo, getWordStatuses } from "../lib/study";
import { listAlbumsForView } from "../lib/albums";
import { recordWordClick } from "../lib/progress";
import { reviewCardById } from "../lib/cards";
import { setWordStatus } from "../lib/dictionary";
import { LIKELY_WEIGHT } from "../lib/known-words";
import { collectCalibrationSamples, formatCalibration, summarizeCalibration } from "../lib/calibration";
import { writeVideoWordCounts } from "../../worker/src/word-counts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

const tok = (surface: string, pos: string, wordEntryId: string | null, posDetail?: string): Token => ({
  surface, lemma: surface, reading: null, romaji: null, pos, wordEntryId, ...(posDetail ? { posDetail } : {}),
});
const pct = (n: number, d: number) => Math.round((100 * n) / d);

async function main() {
  console.log("\n=== E2E: known-word tiers + token-weighted coverage ===\n");

  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `e2e-comp-${stamp}@example.com` }).returning();
  const [stranger] = await db.insert(users).values({ email: `e2e-comp-stranger-${stamp}@example.com` }).returning();
  const def: Definition[] = [{ glosses: ["x"], partsOfSpeech: ["n"] }];

  // 25 countable words + an interjection entry, a name entry and a numeral entry.
  const words = await db.insert(wordEntries).values(
    Array.from({ length: 25 }, (_, i) => ({ language: "ja", lemma: `語${stamp}-${i}`, reading: `r${i}`, pos: "n", definitions: def })),
  ).returning();
  const [wInt, wName, wNum] = await db.insert(wordEntries).values([
    { language: "ja", lemma: `ああ${stamp}`, reading: "ああ", pos: "int", definitions: def },
    { language: "ja", lemma: `田中${stamp}`, reading: "たなか", pos: "n", definitions: def },
    { language: "ja", lemma: `２${stamp}`, reading: "に", pos: "n", definitions: def },
  ]).returning();
  const w = (i: number) => tok(`語${i}`, "名詞", words[i]!.id);
  const rep = (i: number, n: number) => Array.from({ length: n }, () => w(i));
  const stop = tok("。", "記号", null);

  // Running frequency: w0 ×30 (particle-like), w1–w4 ×5, w5–w24 ×1 = 70 tokens, 25 words.
  const lineTokens: Token[][] = [
    [...rep(0, 10), stop],
    [...rep(0, 10), tok("ああ", "感動詞", wInt.id), stop],
    [...rep(0, 10), tok("田中", "名詞", wName.id, "固有名詞"), tok("２", "名詞", wNum.id), stop],
    [...rep(1, 5), ...rep(2, 5)],
    [...rep(3, 5), ...rep(4, 5)],
    Array.from({ length: 10 }, (_, k) => w(5 + k)),
    Array.from({ length: 10 }, (_, k) => w(15 + k)),
  ];

  const [video] = await db.insert(videos).values({
    sourceId: `e2e-comp-${stamp}`, url: "https://youtube.com/watch?v=e2e", title: "E2E coverage", status: "done",
  }).returning();
  const [tinyVideo] = await db.insert(videos).values({
    sourceId: `e2e-comp-tiny-${stamp}`, url: "https://youtube.com/watch?v=e2e2", title: "E2E tiny", status: "done",
  }).returning();
  const lines = await db.insert(subtitleLines).values(lineTokens.map((tokens, idx) => ({
    videoId: video.id, idx, tStartMs: idx * 1000, tEndMs: idx * 1000 + 900, textOriginal: tokens.map((t) => t.surface).join(""), tokens,
  }))).returning();
  const tinyTokens = Array.from({ length: 5 }, (_, i) => w(i));
  await db.insert(subtitleLines).values({ videoId: tinyVideo.id, idx: 0, tStartMs: 0, tEndMs: 900, textOriginal: "x", tokens: tinyTokens });

  // --- Materialized word counts (the worker's writer) ---
  await db.transaction((tx) => writeVideoWordCounts(tx, video.id, "ja", lineTokens));
  await db.transaction((tx) => writeVideoWordCounts(tx, video.id, "ja", lineTokens)); // idempotent re-run
  await db.transaction((tx) => writeVideoWordCounts(tx, tinyVideo.id, "ja", [tinyTokens]));
  const vwc = await db.select().from(videoWordCounts).where(eq(videoWordCounts.videoId, video.id));
  const occ = new Map(vwc.map((r) => [r.wordEntryId, r.occurrences]));
  check("word counts: 25 countable words, 70 running tokens (re-run idempotent)",
    vwc.length === 25 && vwc.reduce((a, r) => a + r.occurrences, 0) === 70, { words: vwc.length });
  check("word counts: running occurrences, not lines (w0 = 30 in 3 lines)", occ.get(words[0]!.id) === 30, occ.get(words[0]!.id));
  check("exclusions: interjection, proper noun, numeral and punctuation not counted",
    !occ.has(wInt.id) && !occ.has(wName.id) && !occ.has(wNum.id));

  let map = await getComprehensionByVideo(db, user.id, [video.id, tinyVideo.id]);
  const c0 = map.get(video.id);
  check("0% (0–0) before any study", c0?.headline === 0 && c0.low === 0 && c0.high === 0, c0);
  check("tiny video is omitted (too few countable tokens)", !map.has(tinyVideo.id));

  // --- Signals for each tier rule ---
  const now = new Date();
  await db.insert(userWordStats).values([
    { userId: user.id, wordEntryId: words[0]!.id, views: 40 },                                              // likely (seen often)
    { userId: user.id, wordEntryId: words[1]!.id, reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true },      // confirmed
    { userId: user.id, wordEntryId: words[2]!.id, reviewsOk: 1, reviewsTotal: 1 },                          // confirmed (legacy row)
    { userId: user.id, wordEntryId: words[3]!.id, views: 40, clicks: 1, lastClickedAt: now },               // unknown (recent lookup)
    { userId: user.id, wordEntryId: words[4]!.id, reviewsOk: 1, reviewsTotal: 2, lastReviewOk: false },     // unknown (last review failed)
    { userId: user.id, wordEntryId: words[6]!.id, views: 50 },                                              // + manual "new" → unknown
    { userId: user.id, wordEntryId: words[7]!.id, views: 50 },                                              // + manual "learning" → likely
    { userId: user.id, wordEntryId: words[8]!.id, views: 5 },                                               // v1 "known"; now unknown
  ]);
  await setWordStatus(db, user.id, words[5]!.id, "known"); // manual known, no stats → confirmed
  await setWordStatus(db, user.id, words[6]!.id, "new");
  await setWordStatus(db, user.id, words[7]!.id, "learning");

  // confirmed: w1 5 + w2 5 + w5 1 = 11 tokens / 3 words; likely: w0 30 + w7 1 = 31 / 2; unknown 28 / 20.
  map = await getComprehensionByVideo(db, user.id, [video.id]);
  const c1 = map.get(video.id)!;
  check("band low = confirmed only (11/70 → 16%)", c1.low === pct(11, 70), c1);
  check("band high = confirmed + likely (42/70 → 60%)", c1.high === pct(42, 70), c1);
  check(`headline = confirmed + ${LIKELY_WEIGHT}·likely (→ ${pct(11 + LIKELY_WEIGHT * 31, 70)}%)`, c1.headline === pct(11 + LIKELY_WEIGHT * 31, 70), c1);
  check("unique-word coverage is secondary and differs (3+2 of 25 words)",
    c1.uniqueLow === pct(3, 25) && c1.uniqueHigh === pct(5, 25) && c1.unique === pct(3 + LIKELY_WEIGHT * 2, 25) && c1.unique !== c1.headline, c1);
  check("counts: 70 tokens, 25 words", c1.tokens === 70 && c1.words === 25, c1);
  // For the record: the v1 metric (distinct words with reviewsOk ≥ 1 or views ≥ 5) would say 8/25 = 32%.

  // --- Player colors: the JS façade agrees with the SQL tiers ---
  const ids = words.map((x) => x.id);
  const st = await getWordStatuses(db, user.id, [...ids, ids[0]!]);
  const expectSeen = [0, 7].map((i) => ids[i]!);
  const expectKnown = [1, 2, 5].map((i) => ids[i]!);
  check("statuses: likely → seen (w0, w7 learning-capped)", expectSeen.every((id) => st[id] === "seen"), st);
  check("statuses: confirmed → known (review, legacy review, manual known)", expectKnown.every((id) => st[id] === "known"), st);
  check("statuses: recent lookup, failed last review, manual new, 5 views → unknown (omitted)",
    [3, 4, 6, 8].every((i) => !(ids[i]! in st)) && Object.keys(st).length === 5, st);
  check("statuses: empty id list → {}", Object.keys(await getWordStatuses(db, user.id, [])).length === 0);

  // --- Album aggregate (same tiers, same headline) ---
  const [album] = await db.insert(albums).values({ userId: user.id, name: "E2E album" }).returning();
  await db.insert(albumVideos).values({ albumId: album.id, videoId: video.id });
  const av = (await listAlbumsForView(db, user.id)).find((a) => a.id === album.id);
  check("album: token-weighted headline and distinct words", av?.pct === c1.headline && av?.words === 25, av);

  // --- Per-user isolation ---
  const sm = (await getComprehensionByVideo(db, stranger.id, [video.id])).get(video.id);
  check("coverage is per-user (stranger: 0% (0–0))", sm?.headline === 0 && sm.high === 0, sm);
  check("statuses are per-user (stranger has none)", Object.keys(await getWordStatuses(db, stranger.id, ids)).length === 0);

  // --- Token corrections (T3.7) are applied as deltas ---
  // line 5 idx 4 is w9 (unknown) → re-pointed to w1 (confirmed); line 6 idx 5 is w20 → "not a dictionary word".
  await db.insert(tokenOverrides).values([
    { userId: user.id, subtitleLineId: lines[5]!.id, startIdx: 4, endIdx: 4, tokens: [tok("語9", "名詞", words[1]!.id)] },
    { userId: user.id, subtitleLineId: lines[6]!.id, startIdx: 5, endIdx: 5, tokens: [tok("語20", "名詞", null)] },
  ]);
  const c2 = (await getComprehensionByVideo(db, user.id, [video.id])).get(video.id)!;
  check("overrides: 69 tokens / 23 words after a re-point and a 'not a word'", c2.tokens === 69 && c2.words === 23, c2);
  check("overrides: low 12/69, high 43/69, headline recomputed",
    c2.low === pct(12, 69) && c2.high === pct(43, 69) && c2.headline === pct(12 + LIKELY_WEIGHT * 31, 69), c2);
  const sm2 = (await getComprehensionByVideo(db, stranger.id, [video.id])).get(video.id);
  check("overrides: the stranger's counts are untouched", sm2?.tokens === 70 && sm2.words === 25, sm2);

  // --- A lookup demotes likely → unknown (click writer stamps last_clicked_at) ---
  await recordWordClick(db, user.id, words[0]!.id);
  const st2 = await getWordStatuses(db, user.id, [ids[0]!]);
  const c3 = (await getComprehensionByVideo(db, user.id, [video.id])).get(video.id)!;
  check("click: w0 drops out of likely (seen → unknown)", !(ids[0]! in st2), st2);
  check("click: band high drops by w0's 30 tokens", c3.high === pct(43 - 30, 69), c3);

  // --- Review writer + calibration snapshot (synthetic data) ---
  const [learner] = await db.insert(users).values({ email: `e2e-comp-learner-${stamp}@example.com` }).returning();
  const [wA, wB, wC, wD] = [words[10]!, words[11]!, words[12]!, words[13]!];
  await db.insert(userWordStats).values([
    { userId: learner.id, wordEntryId: wA.id, views: 20 },  // likely before its first review
    { userId: learner.id, wordEntryId: wD.id, views: 30 },  // reviewed outside the writer → reconstructed
  ]);
  const [l1, l2, l3] = await db.insert(subtitleLines).values([
    { videoId: video.id, idx: 100, tStartMs: 0, tEndMs: 1, textOriginal: "AB", tokens: [tok("A", "名詞", wA.id), tok("B", "名詞", wB.id)] },
    { videoId: video.id, idx: 101, tStartMs: 0, tEndMs: 1, textOriginal: "AC", tokens: [tok("A", "名詞", wA.id), tok("C", "名詞", wC.id)] },
    { videoId: video.id, idx: 102, tStartMs: 0, tEndMs: 1, textOriginal: "D", tokens: [tok("D", "名詞", wD.id)] },
  ]).returning();
  const [card1, card2, card3] = await db.insert(sentenceCards).values([
    { userId: learner.id, subtitleLineId: l1!.id, videoId: video.id },
    { userId: learner.id, subtitleLineId: l2!.id, videoId: video.id },
    { userId: learner.id, subtitleLineId: l3!.id, videoId: video.id },
  ]).returning();
  const r1 = await reviewCardById(db, learner.id, card1!.id, 1); // Again: A (likely) and B (unknown) fail
  const r2 = await reviewCardById(db, learner.id, card2!.id, 3); // Good: A again (not its first), C first
  check("reviews: both writes succeed", r1.status === 200 && r2.status === 200, [r1.status, r2.status]);
  // A log written without the snapshot (as before 0021).
  await db.insert(reviewLogs).values({
    cardId: card3!.id, userId: learner.id, grade: 1, state: 0, due: new Date(), stability: 0, difficulty: 0,
    elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 0,
  });
  const ls = await db.select().from(userWordStats).where(eq(userWordStats.userId, learner.id));
  const byWord = new Map(ls.map((r) => [r.wordEntryId, r]));
  check("snapshot: A's first review recorded as likely / failed — written once",
    byWord.get(wA.id)?.firstReviewTier === "likely" && byWord.get(wA.id)?.firstReviewOk === false, byWord.get(wA.id));
  check("snapshot: B unknown/failed, C unknown/OK",
    byWord.get(wB.id)?.firstReviewTier === "unknown" && byWord.get(wC.id)?.firstReviewTier === "unknown" && byWord.get(wC.id)?.firstReviewOk === true);
  check("last review: A now OK → confirmed", byWord.get(wA.id)?.lastReviewOk === true &&
    (await getWordStatuses(db, learner.id, [wA.id]))[wA.id] === "known");
  check("last review: B failed → not confirmed", byWord.get(wB.id)?.lastReviewOk === false &&
    !((await getWordStatuses(db, learner.id, [wB.id]))[wB.id]));

  const samples = await collectCalibrationSamples(db, { userId: learner.id });
  const rows = summarizeCalibration(samples);
  const row = (tier: string, source: string) => rows.find((r) => r.tier === tier && r.source === source)!;
  check("calibration: one sample per word, from review_logs", samples.length === 4, samples);
  check("calibration: exact likely = A, failed (0% OK)", row("likely", "exact").words === 1 && row("likely", "exact").okRate === 0, row("likely", "exact"));
  check("calibration: exact unknown = B, C (50% OK)", row("unknown", "exact").words === 2 && row("unknown", "exact").okRate === 0.5, row("unknown", "exact"));
  check("calibration: pre-snapshot word reconstructed from today's views (likely)", row("likely", "reconstructed").words === 1, row("likely", "reconstructed"));
  console.log("\n  Calibration on SYNTHETIC E2E data (4 words, one learner):\n");
  console.log(formatCalibration(rows).split("\n").map((l) => "    " + l).join("\n") + "\n");

  // Cleanup.
  await db.delete(users).where(inArray(users.id, [user.id, stranger.id, learner.id]));
  await db.delete(videos).where(inArray(videos.id, [video.id, tinyVideo.id]));
  await db.delete(wordEntries).where(inArray(wordEntries.id, [...ids, wInt.id, wName.id, wNum.id]));
  const left = await db.select().from(savedWords).where(and(eq(savedWords.userId, user.id)));
  check("cleanup cascades", left.length === 0);

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => { console.error("E2E crashed:", err); await closeDb(); process.exit(1); });
