// Maintenance jobs (T3.10): the daily known-word calibration and per-user
// Explore coverage refreshes. Both are small, idempotent recomputations from
// tables the web app writes; neither calls an external service.

import type { Queue } from "bullmq";
import {
  loadKnownWordParams,
  refreshUserVideoCoverage,
  runKnownWordCalibration,
  type Database,
} from "@fuchine/db";
import { CALIBRATION_SCHEDULE, type MaintenanceJob } from "@fuchine/jobs";

export const CALIBRATION_SCHEDULER_ID = "calibrate-known-words-daily";

export async function handleMaintenance(db: Database, job: MaintenanceJob): Promise<string> {
  if (job.kind === "calibrate-known-words") {
    const r = await runKnownWordCalibration(db);
    return r.instance
      ? `calibration: likelyWeight ${r.instance.likelyWeight}, likelyMinViews ${r.instance.likelyMinViews} ` +
          `from ${r.instanceSamples} exact likely first reviews; ${r.usersCalibrated} user(s) on own data, ${r.usersCleared} cleared`
      : `calibration: ${r.instanceSamples} exact likely first reviews — below the minimum, constants stay`;
  }
  if (job.kind === "refresh-coverage") {
    const params = await loadKnownWordParams(db, job.userId);
    const r = await refreshUserVideoCoverage(db, job.userId, { minViews: params.likelyMinViews });
    return `coverage refresh ${job.userId}: ${r.videos} videos in ${r.ms} ms`;
  }
  return `unknown maintenance job ${(job as { kind?: string }).kind ?? "?"}`;
}

/** Register (or update) the daily calibration on the maintenance queue. Idempotent. */
export async function scheduleCalibration(queue: Queue<MaintenanceJob>): Promise<void> {
  await queue.upsertJobScheduler(
    CALIBRATION_SCHEDULER_ID,
    { pattern: CALIBRATION_SCHEDULE },
    { name: "calibrate-known-words", data: { kind: "calibrate-known-words" } },
  );
}
