/**
 * End-to-end test for T3.10 — Explore ranking, i+1 lines and the known-word
 * calibration loop — against a live Postgres. Real read/write paths
 * (getExplore, refreshUserVideoCoverage, getIPlusOneLines,
 * listIPlusOneSuggestions, mineSentence, recordProgress,
 * runKnownWordCalibration, getComprehensionByVideo). No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-explore.ts
 */
import { eq, inArray, like } from "drizzle-orm";
import {
  createDb,
  instanceSettings,
  INSTANCE_KNOWN_WORDS_KEY,
  refreshUserVideoCoverage,
  subtitleLines,
  userSettings,
  userVideoCoverage,
  userVideoFlags,
  userWordStats,
  users,
  videoWordCounts,
  videos,
  wordEntries,
  type Database,
  type Definition,
  type Token,
} from "@fuchine/db";
import { getExplore, coverageFreshness } from "../lib/explore";
import { DEFAULT_BAND } from "../lib/explore-rank";
import { getIPlusOneLines, listIPlusOneSuggestions } from "../lib/i-plus-one";
import { mineSentence } from "../lib/cards";
import { recordProgress } from "../lib/progress";
import { getComprehensionByVideo } from "../lib/study";
import { loadKnownWordParams } from "../lib/known-words";
import { CALIBRATION_MIN_SAMPLE, runKnownWordCalibration } from "../lib/calibration";

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

const def: Definition[] = [{ glosses: ["x"], partsOfSpeech: ["n"] }];
const tok = (surface: string, wordEntryId: string, pos = "名詞"): Token => ({
  surface, lemma: surface, reading: null, romaji: null, pos, wordEntryId,
});

async function main() {
  console.log("\n=== E2E: Explore ranking, i+1 lines, calibration loop ===\n");
  const stamp = Date.now();
  const createdVideos: string[] = [];
  const [userA] = await db.insert(users).values({ email: `e2e-explore-a-${stamp}@example.com` }).returning();
  const [userB] = await db.insert(users).values({ email: `e2e-explore-b-${stamp}@example.com` }).returning();
  const [userC] = await db.insert(users).values({ email: `e2e-explore-c-${stamp}@example.com` }).returning();
  const A = userA!.id, B = userB!.id, C = userC!.id;
  await db.insert(userSettings).values([{ userId: A }, { userId: B }, { userId: C }]);

  try {
    // Dictionary: 20 known words, 10 unknown common (rank ≤ 5000), 10 unknown rare.
    const mk = (prefix: string, n: number, rank: number) =>
      Array.from({ length: n }, (_, i) => ({ language: "ja", lemma: `${prefix}${stamp}-${i}`, reading: `r${i}`, pos: "n", definitions: def, frequencyRank: rank + i }));
    const K = await db.insert(wordEntries).values(mk("既知", 20, 100)).returning();
    const U = await db.insert(wordEntries).values(mk("常用", 10, 1000)).returning();
    const R = await db.insert(wordEntries).values(mk("稀", 10, 20000)).returning();

    // User A knows K (confirmed by a correct review).
    await db.insert(userWordStats).values(K.map((w) => ({
      userId: A, wordEntryId: w.id, views: 3, reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true,
    })));

    // Catalog fixtures: [known occurrences per K word], [unknown (word, n)].
    const known = (a: number, x: number, b: number, y: number) =>
      [...Array.from({ length: a }, () => x), ...Array.from({ length: b }, () => y)];
    type Fixture = { key: string; channel: string; knownOcc: number[]; unknown: [string, number][]; durationS?: number };
    const fixtures: Fixture[] = [
      { key: "center", channel: `Chan Y ${stamp}`, knownOcc: known(12, 5, 8, 4), unknown: U.slice(0, 4).map((w) => [w.id, 2]) }, // 92%
      { key: "chan", channel: `Chan X ${stamp}`, knownOcc: known(6, 10, 14, 9), unknown: R.map((w, i) => [w.id, i < 4 ? 2 : 1]) }, // 186/200 = 93%
      { key: "edge", channel: `Chan Z ${stamp}`, knownOcc: known(16, 5, 4, 4), unknown: U.slice(4, 6).map((w) => [w.id, 2]) }, // 96%
      { key: "low", channel: `Chan Z ${stamp}`, knownOcc: known(20, 4, 0, 0), unknown: U.map((w) => [w.id, 2]) }, // 80%
      { key: "done", channel: `Chan Z ${stamp}`, knownOcc: known(19, 5, 1, 4), unknown: [[R[0]!.id, 1]] }, // 99%
      { key: "hidden", channel: `Chan Z ${stamp}`, knownOcc: known(13, 5, 7, 4), unknown: [[U[6]!.id, 3], [U[7]!.id, 2], [U[8]!.id, 2]] }, // 93%
      { key: "watched", channel: `Chan X ${stamp}`, knownOcc: known(10, 5, 10, 4), unknown: U.slice(0, 5).map((w) => [w.id, 2]), durationS: 600 }, // 90%
    ];
    const ids: Record<string, string> = {};
    for (const f of fixtures) {
      const [v] = await db.insert(videos).values({
        source: "youtube", sourceId: `e2e-explore-${f.key}-${stamp}`, url: "https://youtu.be/x",
        title: `Explore ${f.key}`, channel: f.channel, durationS: f.durationS ?? 900, status: "done",
      }).returning();
      ids[f.key] = v!.id;
      createdVideos.push(v!.id);
      await db.insert(videoWordCounts).values([
        ...f.knownOcc.map((n, i) => ({ videoId: v!.id, wordEntryId: K[i]!.id, occurrences: n })),
        ...f.unknown.map(([w, n]) => ({ videoId: v!.id, wordEntryId: w, occurrences: n })),
      ]);
    }
    const mine = new Set(Object.values(ids));
    await db.insert(userVideoFlags).values({ userId: A, videoId: ids.hidden!, flag: "hidden" });
    // A watched "watched" (Chan X) to the end, through the real beacon.
    const pr = await recordProgress(db, A, ids.watched!, { msWatched: 600_000 });
    check("progress beacon recorded", pr.status === 200, pr);

    // ---- Explore ranking ----
    console.log("\n-- ranking --");
    const before = await coverageFreshness(db, A);
    check("no materialization before the first visit", before.rows === 0 && before.computedAt === null, before);
    let staleCalls = 0;
    const resA = await getExplore(db, A, { band: DEFAULT_BAND, limit: 200, onStale: () => { staleCalls++; } });
    const orderA = resA.items.map((i) => i.video.id).filter((id) => mine.has(id));
    const keyOf = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
    check(
      "ranking: same-channel 93% > 92% center (novelty) > 96% edge > 80% low",
      JSON.stringify(orderA.map((id) => keyOf[id])) === JSON.stringify(["chan", "center", "edge", "low"]),
      orderA.map((id) => keyOf[id]),
    );
    check("hidden video excluded for its user", !orderA.includes(ids.hidden!));
    check("≥ 98% covered video excluded", !orderA.includes(ids.done!));
    check("watched-to-the-end video excluded", !orderA.includes(ids.watched!));
    const center = resA.items.find((i) => i.video.id === ids.center);
    const chan = resA.items.find((i) => i.video.id === ids.chan);
    check("center card explains coverage + novelty", center?.reason === "92% covered · 4 new common words", center?.reason);
    check("narrow viewing names the watched video", chan?.reason === "93% covered · same channel as “Explore watched”", chan?.reason);
    check("first visit materialized synchronously, no background refresh", staleCalls === 0 && !resA.refreshing);
    check("cold start: few known words ⇒ curated channels shown", resA.coldStart && resA.starter.length >= 10, { known: resA.knownWords });

    // Per-user isolation: B knows nothing — A's flag and watch don't apply.
    const resB = await getExplore(db, B, { band: DEFAULT_BAND, limit: 200 });
    const orderB = resB.items.map((i) => i.video.id).filter((id) => mine.has(id));
    check("B sees the video A hid", orderB.includes(ids.hidden!));
    check("B sees the video A watched", orderB.includes(ids.watched!));
    check("B's coverage is B's own (0%), not A's", resB.items.find((i) => i.video.id === ids.center)?.coverage.headline === 0);
    const aRows = await db.select().from(userVideoCoverage).where(eq(userVideoCoverage.userId, A));
    const aCenter = aRows.find((r) => r.videoId === ids.center);
    check("A's materialized row untouched by B", aCenter?.confirmedTokens === 92, aCenter);

    // Stale-while-revalidate: activity since → background refresh requested
    // (not inline), throttled to MIN_REFRESH_INTERVAL.
    await db.insert(userWordStats).values({ userId: A, wordEntryId: U[0]!.id, reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true });
    let requested: string | null = null;
    const throttled = await getExplore(db, A, { band: DEFAULT_BAND, onStale: (u) => { requested = u; } });
    check("refresh throttled right after a compute", requested === null && !throttled.refreshing);
    const later = new Date(Date.now() + 10 * 60_000);
    const stale = await getExplore(db, A, { band: DEFAULT_BAND, now: later, onStale: (u) => { requested = u; } });
    check("activity since ⇒ background refresh requested for this user", requested === A && stale.refreshing);
    const r = await refreshUserVideoCoverage(db, A);
    const [centerAfter] = await db.select().from(userVideoCoverage).where(eq(userVideoCoverage.videoId, ids.center!)).then((rows) => rows.filter((x) => x.userId === A));
    check("worker refresh re-materializes (U0 now confirmed: 94/100)", centerAfter?.confirmedTokens === 94 && r.videos >= fixtures.length, centerAfter);

    // ---- i+1 ----
    console.log("\n-- i+1 --");
    const k = (i: number) => tok(`既${i}`, K[i]!.id);
    const u = (i: number) => tok(`常${i}`, U[i]!.id);
    const lineTokens: Token[][] = [
      [k(0), tok("は", K[1]!.id, "助詞"), u(3)], // i+1 (U3 unknown)
      [k(0), u(3), u(4)], // two new words
      [k(0), k(1), k(2)], // nothing new
      [k(0), k(2), u(5), u(5)], // i+1, repeated new word
    ];
    const lines = await db.insert(subtitleLines).values(lineTokens.map((tokens, idx) => ({
      videoId: ids.center!, idx, tStartMs: idx * 2000, tEndMs: idx * 2000 + 1500, textOriginal: tokens.map((t) => t.surface).join(""), tokens,
    }))).returning();
    const asLines = lines.map((l) => ({ id: l.id, tokens: l.tokens ?? [] }));
    const ipA = await getIPlusOneLines(db, A, asLines, "ja");
    check("i+1 lines flagged: lines 0 and 3", [...ipA.keys()].sort().join() === [lines[0]!.id, lines[3]!.id].sort().join(), [...ipA.keys()]);
    check("i+1 target is the unknown word's token", ipA.get(lines[0]!.id)?.tokenIdx === 2 && ipA.get(lines[3]!.id)?.wordEntryId === U[5]!.id);
    const ipB = await getIPlusOneLines(db, B, asLines, "ja");
    check("per-user: nothing is i+1 for a learner who knows nothing", ipB.size === 0);
    const sugg1 = await listIPlusOneSuggestions(db, A, ids.center!, 10);
    check("suggestions list the unmined i+1 lines", sugg1?.length === 2, sugg1);
    const mined = await mineSentence(db, A, { subtitleLineId: lines[0]!.id });
    check("mining is an explicit call (201)", mined.status === 201, mined.status);
    const sugg2 = await listIPlusOneSuggestions(db, A, ids.center!, 10);
    check("a mined line leaves the suggestions", sugg2?.length === 1 && sugg2[0]!.lineId === lines[3]!.id, sugg2);

    // ---- calibration loop ----
    console.log("\n-- calibration --");
    // C: 29 exact "likely" first reviews, 23 OK — below the minimum.
    const cal = await db.insert(wordEntries).values(mk("較正", CALIBRATION_MIN_SAMPLE + 5, 30000)).returning();
    await db.insert(userWordStats).values(cal.slice(0, CALIBRATION_MIN_SAMPLE - 1).map((w, i) => ({
      userId: C, wordEntryId: w.id, views: 20, reviewsOk: i < 23 ? 1 : 0, reviewsTotal: 1, lastReviewOk: i < 23,
      firstReviewTier: "likely", firstReviewOk: i < 23,
    })));
    await runKnownWordCalibration(db);
    const [cBelow] = await db.select({ p: userSettings.knownWordParams }).from(userSettings).where(eq(userSettings.userId, C));
    check(`no per-user weight below ${CALIBRATION_MIN_SAMPLE} samples`, cBelow?.p == null, cBelow);
    // The 30th sample (OK) → 24/30 = 0.8.
    await db.insert(userWordStats).values({
      userId: C, wordEntryId: cal[CALIBRATION_MIN_SAMPLE - 1]!.id, views: 20, reviewsOk: 1, reviewsTotal: 1, lastReviewOk: true,
      firstReviewTier: "likely", firstReviewOk: true,
    });
    const report = await runKnownWordCalibration(db);
    const [cAt] = await db.select({ p: userSettings.knownWordParams }).from(userSettings).where(eq(userSettings.userId, C));
    check("per-user weight written at 30 samples: 24/30 = 0.8", cAt?.p?.likelyWeight === 0.8 && cAt.p.samples === 30 && cAt.p.scope === "user", cAt?.p);
    check("instance calibration written (≥ 30 exact likely samples)", report.instance !== null && report.instanceSamples >= CALIBRATION_MIN_SAMPLE, report);
    const [inst] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, INSTANCE_KNOWN_WORDS_KEY));
    check("instance_settings row stored", Boolean(inst), inst);
    const pC = await loadKnownWordParams(db, C);
    check("C's params come from C's own data", pC.source === "user" && pC.likelyWeight === 0.8, pC);
    // The coverage formula uses the measured weight: C sees K as likely in "center".
    await db.insert(userWordStats).values(K.map((w) => ({ userId: C, wordEntryId: w.id, views: 30 })));
    const covC = (await getComprehensionByVideo(db, C, [ids.center!])).get(ids.center!);
    check(
      "headline uses the calibrated weight (92 likely tokens × 0.8 ⇒ 74%)",
      covC?.headline === Math.round(92 * pC.likelyWeight) && covC.high === 92 && covC.low === 0,
      covC,
    );
    const again = await runKnownWordCalibration(db);
    const [cAgain] = await db.select({ p: userSettings.knownWordParams }).from(userSettings).where(eq(userSettings.userId, C));
    check("re-running on unchanged data keeps the threshold", cAgain?.p?.likelyMinViews === cAt?.p?.likelyMinViews && again.usersCalibrated >= 1);
  } finally {
    // Leave no instance-wide calibration behind for the suites that follow.
    await db.delete(instanceSettings).where(eq(instanceSettings.key, INSTANCE_KNOWN_WORDS_KEY));
    if (createdVideos.length) await db.delete(videos).where(inArray(videos.id, createdVideos));
    await db.delete(users).where(inArray(users.id, [A, B, C]));
    await db.delete(wordEntries).where(like(wordEntries.lemma, `%${stamp}-%`));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("e2e-explore crashed:", err);
  process.exit(1);
});
