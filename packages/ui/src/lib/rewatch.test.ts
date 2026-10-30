import { describe, it, expect } from "vitest";
import {
  REWATCH_SETTLE_TICKS,
  REWATCH_TIMES,
  rewatchTick,
  startRewatch,
  type RewatchPlan,
} from "./rewatch";

const clip = { startMs: 10_000, endMs: 12_500 };

/** Feed readings in order; return the final step and every effect emitted. */
function run(plan: RewatchPlan, readings: number[]) {
  let p: RewatchPlan | null = plan;
  const effects: unknown[] = [];
  for (const ms of readings) {
    if (!p) break;
    const step = rewatchTick(p, ms);
    effects.push(...step.effects);
    p = step.plan;
  }
  return { plan: p, effects };
}

describe("startRewatch", () => {
  it("seeks to the clip start and plays, twice by default", () => {
    const { plan, effects } = startRewatch(clip, 15_000);
    expect(REWATCH_TIMES).toBe(2);
    expect(plan).toMatchObject({ startMs: 10_000, endMs: 12_500, remaining: 2, resumeMs: 15_000 });
    expect(plan?.settling).toBe(REWATCH_SETTLE_TICKS);
    expect(effects).toEqual([{ type: "seek", ms: 10_000 }, { type: "play" }]);
  });

  it("resumes no earlier than the clip end", () => {
    expect(startRewatch(clip, 11_000).plan?.resumeMs).toBe(12_500);
  });

  it("refuses an empty clip or zero plays", () => {
    expect(startRewatch({ startMs: 5, endMs: 5 }, 0).plan).toBeNull();
    expect(startRewatch(clip, 0, 0).plan).toBeNull();
  });
});

describe("rewatchTick", () => {
  it("replays the exact clip twice, then jumps back to where the user was", () => {
    const { plan } = startRewatch(clip, 15_000);
    const { plan: end, effects } = run(plan!, [
      15_000, // stale reading right after seekTo — ignored while settling
      10_050, 11_000, 12_000, 12_600, // play 1 ends → seek back
      12_700, // stale again
      10_020, 12_510, // play 2 ends → resume
    ]);
    expect(end).toBeNull();
    expect(effects).toEqual([{ type: "seek", ms: 10_000 }, { type: "seek", ms: 15_000 }]);
  });

  it("continues from the clip end when mined right as the line finished", () => {
    const { plan } = startRewatch(clip, 12_400);
    const { plan: end, effects } = run(plan!, [10_000, 12_500, 10_000, 12_600]);
    expect(end).toBeNull();
    // Only the replay seek; the resume point is the clip end itself.
    expect(effects).toEqual([{ type: "seek", ms: 10_000 }]);
  });

  it("accepts a seek that lands a little before the start (keyframes)", () => {
    const { plan } = startRewatch(clip, 15_000);
    const step = rewatchTick(plan!, 9_800);
    expect(step.plan?.settling).toBe(0);
  });

  it("gives up if the seek never lands", () => {
    const { plan } = startRewatch(clip, 15_000);
    const { plan: end, effects } = run(plan!, Array(REWATCH_SETTLE_TICKS).fill(30_000));
    expect(end).toBeNull();
    expect(effects).toEqual([]);
  });

  it("is abandoned when the user seeks away mid-replay", () => {
    const { plan } = startRewatch(clip, 15_000);
    expect(run(plan!, [10_100, 40_000]).plan).toBeNull();
    expect(run(plan!, [10_100, 2_000]).plan).toBeNull();
  });

  it("does nothing while the clip plays", () => {
    const { plan } = startRewatch(clip, 15_000);
    const settled = rewatchTick(plan!, 10_100).plan!;
    expect(rewatchTick(settled, 11_000)).toEqual({ plan: settled, effects: [] });
  });

  it("honors a custom count", () => {
    const { plan } = startRewatch(clip, 12_500, 3);
    const { effects } = run(plan!, [10_000, 12_500, 10_000, 12_500, 10_000, 12_500]);
    expect(effects).toEqual([{ type: "seek", ms: 10_000 }, { type: "seek", ms: 10_000 }]);
  });
});
