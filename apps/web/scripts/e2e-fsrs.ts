/**
 * End-to-end test for FSRS-7 + per-user parameters + desired retention (T3.1).
 *
 * Runs the REAL lib functions (`mineSentence`, `reviewCardById`,
 * `getFsrsSettings`, `updateFsrsSettings`, `exportReviewLogsCsv`) against a
 * live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-fsrs.ts
 */
import { and, eq } from "drizzle-orm";
import { createDb, users, videos, subtitleLines, sentenceCards, reviewLogs, userSettings } from "@fuchine/db";
import { DEFAULT_FSRS7_PARAMS, GRADE, newCardState } from "@fuchine/core";
import { mineSentence, reviewCardById } from "../lib/cards";
import {
  REVLOG_CSV_HEADER, cardStateOf, exportReviewLogsCsv, getFsrsSettings, loadUserFsrs, updateFsrsSettings,
} from "../lib/fsrs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

const DAY = 86_400_000;

async function cardRow(id: string) {
  const [c] = await db.select().from(sentenceCards).where(eq(sentenceCards.id, id)).limit(1);
  return c!;
}
async function logsOf(cardId: string) {
  return db.select().from(reviewLogs).where(eq(reviewLogs.cardId, cardId));
}
/** Interval in days the last review gave the card. */
async function lastInterval(id: string) {
  const c = await cardRow(id);
  return (c.due.getTime() - c.lastReview!.getTime()) / DAY;
}

async function main() {
  console.log("\n=== E2E: FSRS-7 + per-user params ===\n");
  const stamp = Date.now();
  const [user] = await db.insert(users).values({ email: `e2e-fsrs-${stamp}@example.com` }).returning();
  const [other] = await db.insert(users).values({ email: `e2e-fsrs-other-${stamp}@example.com` }).returning();
  const [video] = await db.insert(videos).values({
    source: "youtube", sourceId: `e2e-fsrs-${stamp}`, url: "https://www.youtube.com/watch?v=e2e",
    title: "E2E fsrs", language: "ja", status: "done",
  }).returning();
  const lines = await db.insert(subtitleLines).values(
    [0, 1, 2, 3, 4].map((idx) => ({
      videoId: video.id, idx, tStartMs: idx * 1000, tEndMs: idx * 1000 + 900, textOriginal: `行${idx}`, tokens: [],
    })),
  ).returning();
  const mine = async (userId: string, lineIdx: number) =>
    ((await mineSentence(db, userId, { subtitleLineId: lines[lineIdx]!.id })).body.card as { id: string }).id;

  // --- 1. Defaults: review with FSRS-7 default params ---
  console.log("1. Review with default params");
  const a = await mine(user.id, 0);
  const minedA = await cardRow(a);
  check("mined card starts on FSRS-7 with stability_fast 0", minedA.fsrsModel === "fsrs-7" && minedA.stabilityFast === 0, minedA);
  const r1 = await reviewCardById(db, user.id, a, GRADE.Good);
  check("review => 200", r1.status === 200, r1);
  const afterA = await cardRow(a);
  check("card has an FSRS-7 fast trace", (afterA.stabilityFast ?? 0) > 0, afterA);
  check("card scheduled in the future", afterA.due.getTime() > Date.now());
  const [logA] = await logsOf(a);
  check("log records model + pre-review state", logA?.fsrsModel === "fsrs-7" && logA?.state === 0 && logA?.stabilityFast === 0, logA);
  const defaultIvl = await lastInterval(a);
  check("default Good interval > 1 day", defaultIvl > 1, defaultIvl);

  const s0 = await getFsrsSettings(db, user.id);
  check("settings: defaults (params null, retention 0.9)", s0.params === null && s0.desiredRetention === 0.9, s0);
  check("settings: review count + 400 minimum", s0.reviewCount === 1 && s0.minReviewsToOptimize === 400, s0);

  // --- 2. Invalid params are rejected; nothing stored ---
  console.log("2. Invalid params rejected");
  const bad = [
    { params: [1, 2, 3] },
    { params: new Array(21).fill(0.5) }, // FSRS-6 length
    { params: [...DEFAULT_FSRS7_PARAMS.slice(0, 33), "x"] },
    { params: DEFAULT_FSRS7_PARAMS.map((v, i) => (i === 0 ? 1e9 : v)) }, // out of bounds
    { desiredRetention: 0.5 },
    { desiredRetention: 0.99 },
    {},
  ];
  for (const body of bad) {
    const r = await updateFsrsSettings(db, user.id, body);
    check(`rejects ${JSON.stringify(body).slice(0, 40)} => 400`, r.status === 400, r);
  }
  const [stored0] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
  check("nothing stored after rejections", stored0 == null || (stored0.fsrsParams == null && stored0.desiredRetention == null), stored0);

  // --- 3. Store custom params; reviews use them ---
  console.log("3. Custom params change the schedule");
  const custom = [...DEFAULT_FSRS7_PARAMS];
  custom[2] = DEFAULT_FSRS7_PARAMS[2]! * 3; // initial stability after "Good"
  const stabilityBefore = afterA.stability;
  const put = await updateFsrsSettings(db, user.id, { params: custom });
  check("PUT params => 200", put.status === 200, put.body.error);
  check("stored params echoed back", JSON.stringify(put.body.params) === JSON.stringify(custom));
  check("learned card memory replayed under new weights", (put.body.rebuilt as { replayed: number })?.replayed === 1, put.body.rebuilt);
  const replayedA = await cardRow(a);
  check("card A stability recomputed", replayedA.stability > stabilityBefore * 2, { before: stabilityBefore, after: replayedA.stability });
  check("card A due date untouched by the rebuild", replayedA.due.getTime() === afterA.due.getTime());

  const b = await mine(user.id, 1);
  await reviewCardById(db, user.id, b, GRADE.Good);
  const customIvl = await lastInterval(b);
  check("custom-param Good interval is longer", customIvl > defaultIvl * 2, { defaultIvl, customIvl });

  // --- 4. Desired retention persisted and applied ---
  console.log("4. Desired retention");
  const r85 = await updateFsrsSettings(db, user.id, { desiredRetention: 0.85 });
  check("PUT retention => 200", r85.status === 200, r85.body.error);
  const s1 = await getFsrsSettings(db, user.id);
  check("retention persisted (0.85)", s1.desiredRetention === 0.85, s1.desiredRetention);
  check("params kept when only retention changes", JSON.stringify(s1.params) === JSON.stringify(custom));
  const fsrs85 = await loadUserFsrs(db, user.id);
  await updateFsrsSettings(db, user.id, { desiredRetention: 0.95 });
  const fsrs95 = await loadUserFsrs(db, user.id);
  const stateB = cardStateOf(await cardRow(b));
  const at = new Date(stateB.due.getTime());
  check(
    "lower retention previews a later Good due",
    fsrs85.preview(b, stateB, at)[GRADE.Good].getTime() > fsrs95.preview(b, stateB, at)[GRADE.Good].getTime(),
  );
  const pts = s1.workload.points;
  const w80 = pts.find((p) => p.retention === 0.8)!.reviewsPerDay;
  const w95 = pts.find((p) => p.retention === 0.95)!.reviewsPerDay;
  check("workload preview: 16 stops, more reviews at 0.95 than 0.80", pts.length === 16 && w95 > w80, { w80, w95 });
  check("workload labelled as an approximation", s1.workload.method === "approximation");

  // --- 5. Cards from before migration 0018 ---
  console.log("5. Pre-0018 cards");
  const t0 = new Date(Date.now() - 10 * DAY);
  const legacyBase = {
    userId: user.id, videoId: video.id, stability: 8.3, difficulty: 5.1, state: 2,
    lastReview: new Date(t0.getTime() + 2 * DAY), due: new Date(Date.now() - DAY),
    elapsedDays: 2, scheduledDays: 7, stabilityFast: null, fsrsModel: "fsrs-7",
  };
  const [c] = await db.insert(sentenceCards).values({ ...legacyBase, subtitleLineId: lines[2]!.id, reps: 2 }).returning();
  await db.insert(reviewLogs).values([0, 2].map((d, i) => ({
    cardId: c!.id, userId: user.id, grade: 3, state: i === 0 ? 0 : 2, due: new Date(t0.getTime() + d * DAY),
    stability: 0, difficulty: 0, elapsedDays: d, lastElapsedDays: 0, scheduledDays: 0,
    reviewedAt: new Date(t0.getTime() + d * DAY),
  })));
  const rc = await reviewCardById(db, user.id, c!.id, GRADE.Good);
  const cAfter = await cardRow(c!.id);
  check("complete-history card reviews => 200", rc.status === 200, rc);
  check("…and is upgraded to FSRS-7 (fast trace from replay)", cAfter.fsrsModel === "fsrs-7" && (cAfter.stabilityFast ?? 0) > 0, cAfter);

  const [d] = await db.insert(sentenceCards).values({ ...legacyBase, subtitleLineId: lines[3]!.id, reps: 3 }).returning();
  const rd = await reviewCardById(db, user.id, d!.id, GRADE.Again);
  const dAfter = await cardRow(d!.id);
  const [dLog] = await logsOf(d!.id);
  check("no-history card reviews => 200", rd.status === 200, rd);
  check("…and stays on FSRS-5 without an invented fast trace", dAfter.fsrsModel === "fsrs-5" && dAfter.stabilityFast === null, dAfter);
  check("…its log says fsrs-5", dLog?.fsrsModel === "fsrs-5", dLog);
  check("…and still reschedules (lapse counted)", dAfter.lapses === 1 && dAfter.due.getTime() > Date.now());

  // --- 6. Export: own logs only, optimizer format ---
  console.log("6. Revlog export");
  const o = await mine(other.id, 4);
  await reviewCardById(db, other.id, o, GRADE.Good);
  const csv = await exportReviewLogsCsv(db, user.id);
  const rows = csv.trim().split("\n");
  const ownLogs = await db.select().from(reviewLogs).where(eq(reviewLogs.userId, user.id));
  check("header is the optimizer's revlog header", rows[0] === REVLOG_CSV_HEADER, rows[0]);
  check("one row per own review", rows.length - 1 === ownLogs.length, { rows: rows.length - 1, logs: ownLogs.length });
  check("no other user's card in the export", !csv.includes(o));
  check("rows are card_id,epoch_ms,rating,state,0", rows.slice(1).every((r) => /^[0-9a-f-]{36},\d{13},[1-4],[0-3],0$/.test(r)), rows.slice(0, 3));

  // --- 7. Reset to defaults ---
  console.log("7. Reset");
  const reset = await updateFsrsSettings(db, user.id, { params: null, desiredRetention: null });
  check("reset => 200, back to defaults", reset.status === 200 && reset.body.params === null && reset.body.desiredRetention === 0.9, reset.body);
  const fresh = await loadUserFsrs(db, user.id);
  check("scheduler back on default weights", !fresh.customParams);
  const s = newCardState();
  check("new-card preview still works", fresh.preview("x", s)[GRADE.Good].getTime() > Date.now());

  // Cleanup (cascades cards/logs/settings).
  await db.delete(users).where(and(eq(users.id, user.id)));
  await db.delete(users).where(eq(users.id, other.id));
  await db.delete(videos).where(eq(videos.id, video.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => {
  console.error("E2E crashed:", err);
  await closeDb();
  process.exit(1);
});
