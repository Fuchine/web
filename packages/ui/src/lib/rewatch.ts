// "Rewatch now" (T3.6): right after mining a line, replay its exact clip N
// times, then hand playback back. Pure timing state machine — the Player feeds
// it the polled playhead and runs the effects against the IFrame (same split
// as lib/listening.ts). Repetition right after noticing a line is the cheap
// win the research on dual-subtitled viewing points to.

/** How many times the mined clip is replayed ("Rewatch ×2"). */
export const REWATCH_TIMES = 2;

/**
 * Seeks on the IFrame land late: the first polls after seekTo can still read
 * the old position. While settling, out-of-clip readings are ignored for this
 * many ticks; a seek that never lands cancels the rewatch instead of looping.
 */
export const REWATCH_SETTLE_TICKS = 8;

/** Keyframe slack: a seek to startMs may land slightly before it. */
const START_SLACK_MS = 300;

/**
 * A reading this far outside the clip (before its start, or past its end
 * beyond what one poll can overshoot) means the user moved the playhead:
 * the rewatch is abandoned, not fought.
 */
export const REWATCH_DRIFT_MS = 1500;

export type RewatchClip = { startMs: number; endMs: number };

export type RewatchPlan = RewatchClip & {
  /** Plays left, including the one in progress. */
  remaining: number;
  /** Where normal playback resumes after the last replay. */
  resumeMs: number;
  /** >0 while waiting for a seek to land inside the clip (ticks left). */
  settling: number;
};

export type RewatchEffect = { type: "seek"; ms: number } | { type: "play" };

export type RewatchStep = { plan: RewatchPlan | null; effects: RewatchEffect[] };

/**
 * Start replaying `clip` `times` times from the current playhead. Resumes at
 * the later of where the user was and the clip end, so nothing is skipped
 * that wasn't already heard, and nothing heard is forced again.
 */
export function startRewatch(
  clip: RewatchClip,
  currentMs: number,
  times: number = REWATCH_TIMES,
): RewatchStep {
  if (!(clip.endMs > clip.startMs) || times < 1) return { plan: null, effects: [] };
  return {
    plan: {
      startMs: clip.startMs,
      endMs: clip.endMs,
      remaining: Math.floor(times),
      resumeMs: Math.max(currentMs, clip.endMs),
      settling: REWATCH_SETTLE_TICKS,
    },
    effects: [{ type: "seek", ms: clip.startMs }, { type: "play" }],
  };
}

/** Advance the plan with one playhead reading. A null plan = rewatch over. */
export function rewatchTick(plan: RewatchPlan, ms: number): RewatchStep {
  const inClip = ms >= plan.startMs - START_SLACK_MS && ms < plan.endMs;

  if (plan.settling > 0) {
    if (inClip) return { plan: { ...plan, settling: 0 }, effects: [] };
    const left = plan.settling - 1;
    return left > 0 ? { plan: { ...plan, settling: left }, effects: [] } : { plan: null, effects: [] };
  }

  if (ms < plan.startMs - REWATCH_DRIFT_MS || ms >= plan.endMs + REWATCH_DRIFT_MS) {
    return { plan: null, effects: [] }; // the user seeked away
  }

  if (ms < plan.endMs) return { plan, effects: [] };

  // Reached the clip end: one play done.
  const remaining = plan.remaining - 1;
  if (remaining > 0) {
    return {
      plan: { ...plan, remaining, settling: REWATCH_SETTLE_TICKS },
      effects: [{ type: "seek", ms: plan.startMs }],
    };
  }
  // Last play done → back to where the user was (only if that's ahead).
  return {
    plan: null,
    effects: plan.resumeMs > ms + START_SLACK_MS ? [{ type: "seek", ms: plan.resumeMs }] : [],
  };
}
