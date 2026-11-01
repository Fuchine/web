// Known-word model (T3.9). Since T3.10 the rule lives in @fuchine/db
// (packages/db/src/known-words.ts) so the worker's calibration job and
// Explore's coverage materialization share it; this module re-exports it for
// the web app. Spec: docs/plans/2026-10-30-known-words-spec.md.

export {
  WORD_TIERS,
  signalsFromRow,
  CONFIRMED_MIN_REVIEWS_OK,
  LIKELY_MIN_VIEWS,
  LIKELY_VIEWS_PER_CLICK,
  LOOKUP_DECAY_DAYS,
  LIKELY_WEIGHT,
  COVERAGE_MIN_TOKENS,
  COVERAGE_MIN_WORDS,
  DEFAULT_KNOWN_WORD_PARAMS,
  LIKELY_WEIGHT_RANGE,
  LIKELY_MIN_VIEWS_RANGE,
  paramsFromStored,
  wordTier,
  wordTierSql,
  wordTierSqlFor,
  emptyTierCounts,
  coverageFromTierCounts,
  tierCountsFromWords,
  applyCountDeltas,
  diffCounts,
  loadKnownWordParams,
  type WordTier,
  type ManualStatus,
  type WordSignals,
  type TierCounts,
  type Coverage,
  type KnownWordParams,
} from "@fuchine/db";
