/**
 * Known-word calibration report (T3.9 → T3.10). From review_logs: how often a
 * word in tier "likely" just before its first review was answered correctly —
 * i.e. whether "likely" is too optimistic. Prints a table per tier and the
 * suggested headline weight for likely tokens.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/calibrate-known-words.ts [--user <uuid>]
 *
 * "exact" rows use the tier snapshot written at review time (0021 on);
 * "reconstructed" rows (older words) recompute it from today's views/clicks
 * and are optimistic. Read-only.
 */
import { createDb, type Database } from "@fuchine/db";
import {
  CALIBRATION_MIN_SAMPLE,
  collectCalibrationSamples,
  formatCalibration,
  suggestLikelyWeight,
  summarizeCalibration,
} from "../lib/calibration";
import { LIKELY_MIN_VIEWS, LIKELY_WEIGHT, LOOKUP_DECAY_DAYS } from "../lib/known-words";
import { isUuid } from "../lib/ids";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const userArg = process.argv.indexOf("--user");
const userId = userArg >= 0 ? process.argv[userArg + 1] : undefined;
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
    console.log(`Rule: likely = views ≥ ${LIKELY_MIN_VIEWS}, ≤ 1 lookup per 10 views, no lookup in ${LOOKUP_DECAY_DAYS} days.\n`);
    console.log(formatCalibration(rows));
    const s = suggestLikelyWeight(rows);
    console.log(
      s.basis === "measured"
        ? `\nSuggested LIKELY_WEIGHT = ${s.weight} (measured on ${s.n} exact "likely" words; current ${LIKELY_WEIGHT}).`
        : `\nNot enough exact "likely" samples (${s.n} < ${CALIBRATION_MIN_SAMPLE}): keep LIKELY_WEIGHT = ${LIKELY_WEIGHT}.`,
    );
    console.log('If "likely" words fail their first review much more often than "confirmed" ones, raise LIKELY_MIN_VIEWS.\n');
  } finally {
    const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
    await anyDb.$client?.end?.();
  }
}

main().catch((err) => { console.error("calibration failed:", err); process.exit(1); });
