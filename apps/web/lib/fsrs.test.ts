import { describe, expect, it } from "vitest";
import { DEFAULT_FSRS7_PARAMS } from "@fuchine/core";
import {
  MIN_REVIEWS_FOR_OPTIMIZE, REVLOG_CSV_HEADER, WORKLOAD_RETENTIONS, cardStateOf,
  parseFsrsSettingsInput, toRevlogCsv,
} from "./fsrs";

describe("toRevlogCsv", () => {
  it("writes the optimizer's revlog columns, one line per review", () => {
    const csv = toRevlogCsv([
      { cardId: "c1", reviewedAt: new Date(1_700_000_000_000), grade: 3, state: 0 },
      { cardId: "c1", reviewedAt: new Date(1_700_086_400_000), grade: 1, state: 2 },
    ]);
    expect(csv.split("\n")).toEqual([
      REVLOG_CSV_HEADER,
      "c1,1700000000000,3,0,0",
      "c1,1700086400000,1,2,0",
      "",
    ]);
  });

  it("skips grades the optimizer can't use", () => {
    const csv = toRevlogCsv([{ cardId: "c", reviewedAt: new Date(0), grade: 0, state: 2 }]);
    expect(csv).toBe(`${REVLOG_CSV_HEADER}\n`);
  });
});

describe("parseFsrsSettingsInput", () => {
  it("accepts 34 in-bounds params and a retention in range", () => {
    const r = parseFsrsSettingsInput({ params: [...DEFAULT_FSRS7_PARAMS], desiredRetention: 0.87 });
    expect(r).toEqual({ ok: true, value: { params: [...DEFAULT_FSRS7_PARAMS], desiredRetention: 0.87 } });
  });

  it("null resets either field", () => {
    expect(parseFsrsSettingsInput({ params: null })).toEqual({ ok: true, value: { params: null } });
    expect(parseFsrsSettingsInput({ desiredRetention: null })).toEqual({ ok: true, value: { desiredRetention: null } });
  });

  it("rejects bad params, bad retention and empty bodies", () => {
    expect(parseFsrsSettingsInput({ params: [1, 2, 3] }).ok).toBe(false);
    expect(parseFsrsSettingsInput({ params: new Array(21).fill(0.5) }).ok).toBe(false);
    expect(parseFsrsSettingsInput({ params: { 0: 1 } }).ok).toBe(false);
    expect(parseFsrsSettingsInput({ desiredRetention: 0.5 }).ok).toBe(false);
    expect(parseFsrsSettingsInput({ desiredRetention: 0.99 }).ok).toBe(false);
    expect(parseFsrsSettingsInput({}).ok).toBe(false);
    expect(parseFsrsSettingsInput(null).ok).toBe(false);
    expect(parseFsrsSettingsInput([]).ok).toBe(false);
  });
});

describe("constants and mapping", () => {
  it("workload stops span the slider 0.80–0.95 by 0.01", () => {
    expect(WORKLOAD_RETENTIONS[0]).toBe(0.8);
    expect(WORKLOAD_RETENTIONS.at(-1)).toBe(0.95);
    expect(WORKLOAD_RETENTIONS).toHaveLength(16);
  });

  it("minimum reviews is the documented 400 fallback", () => {
    expect(MIN_REVIEWS_FOR_OPTIMIZE).toBe(400);
  });

  it("cardStateOf maps an unknown model to fsrs-7 and keeps fsrs-5", () => {
    const row = {
      stability: 1, stabilityFast: null, difficulty: 5, due: new Date(0), lastReview: null, state: 2,
      reps: 1, lapses: 0, elapsedDays: 0, scheduledDays: 1, learningStep: 0, fsrsModel: "fsrs-5",
    };
    expect(cardStateOf(row).model).toBe("fsrs-5");
    expect(cardStateOf({ ...row, fsrsModel: "fsrs-7" }).model).toBe("fsrs-7");
  });
});
