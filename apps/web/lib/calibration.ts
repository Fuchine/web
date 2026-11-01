// Known-word calibration (T3.9 report → T3.10 loop). The logic lives in
// @fuchine/db (packages/db/src/calibration.ts) so the worker's daily job and
// scripts/calibrate-known-words.ts share it; re-exported here for the web app.

export {
  CALIBRATION_MIN_SAMPLE,
  LIKELY_OK_LOW,
  LIKELY_OK_HIGH,
  summarizeCalibration,
  suggestLikelyWeight,
  suggestLikelyMinViews,
  measuredLikelyWeight,
  calibrateFromCounts,
  collectCalibrationSamples,
  formatCalibration,
  runKnownWordCalibration,
  type CalibrationSample,
  type CalibrationRow,
  type CalibrationRunReport,
} from "@fuchine/db";
