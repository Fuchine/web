/**
 * Known-word calibration report (T3.9 → T3.10). From review_logs: how often a
 * word in tier "likely" just before its first review was answered correctly —
 * i.e. whether "likely" is too optimistic. Prints a table per tier and the
 * suggested headline weight for likely tokens.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/calibrate-known-words.ts [--user <uuid>] [--apply]
 *
 * --apply also runs the calibration loop now (what the worker's daily
 * `calibrate-known-words` job does): it stores the measured LIKELY_WEIGHT and
 * the suggested LIKELY_MIN_VIEWS (per instance; per user with enough data of
 * their own) that coverage then uses instead of the constants.
 *
 * "exact" rows use the tier snapshot written at review time (0021 on);
 * "reconstructed" rows (older words) recompute it from today's views/clicks
 * and are optimistic. Read-only unless --apply.
 */
import { createDb, type Database } from "@fuchine/db";
import {
  CALIBRATION_MIN_SAMPLE,
  collectCalibrationSamples,
  formatCalibration,
  runKnownWordCalibration,
  suggestLikelyWeight,
  summarizeCalibration,
} from "../lib/calibration";
import { LIKELY_WEIGHT, LOOKUP_DECAY_DAYS, loadKnownWordParams } from "../lib/known-words";
import { isUuid } from "../lib/ids";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const userArg = process.argv.indexOf("--user");
const userId = userArg >= 0 ? process.argv[userArg + 1] : undefined;
const apply = process.argv.includes("--apply");
if (userId !== undefined && !isUuid(userId)) {
  console.error("--user needs a user id (uuid)");
  process.exit(1);
}

async function main() {
  const db = createDb(url!) as Database;
  try {
    const samples = await collectCalibrationSamples(db, { userId });
    const rows = summarizeCalibration(samples);
    console.log(`\nKnown-word calibration — ${samples.length} words with a review${userId ? ` (user ${userId})` : ""}`);
    const params = await loadKnownWordParams(db, userId ?? null);
    console.log(`Rule: likely = views ≥ ${params.likelyMinViews} (${params.source}), ≤ 1 lookup per 10 views, no lookup in ${LOOKUP_DECAY_DAYS} days; headline weight ${params.likelyWeight}.\n`);
    console.log(formatCalibration(rows));
    const s = suggestLikelyWeight(rows);
    console.log(
      s.basis === "measured"
        ? `\nSuggested LIKELY_WEIGHT = ${s.weight} (measured on ${s.n} exact "likely" words; current ${LIKELY_WEIGHT}).`
        : `\nNot enough exact "likely" samples (${s.n} < ${CALIBRATION_MIN_SAMPLE}): keep LIKELY_WEIGHT = ${LIKELY_WEIGHT}.`,
    );
    console.log('If "likely" words fail their first review much more often than "confirmed" ones, raise LIKELY_MIN_VIEWS.\n');
    if (apply) {
      const r = await runKnownWordCalibration(db);
      console.log(
        r.instance
          ? `Applied: instance likelyWeight = ${r.instance.likelyWeight}, likelyMinViews = ${r.instance.likelyMinViews} (${r.instanceSamples} exact likely first reviews); ${r.usersCalibrated} user(s) calibrated on their own data, ${r.usersCleared} cleared.\n`
          : `Applied: only ${r.instanceSamples} exact likely first reviews (< ${CALIBRATION_MIN_SAMPLE}) — constants stay in force.\n`,
      );
    }
  } finally {
    const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
    await anyDb.$client?.end?.();
  }
}

main().catch((err) => { console.error("calibration failed:", err); process.exit(1); });
