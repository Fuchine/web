import { describe, it, expect } from "vitest";
import { parseSettingsInput } from "./settings";

describe("parseSettingsInput — dailyGoals", () => {
  it("accepts valid goals and keeps only the known fields", () => {
    const r = parseSettingsInput({ dailyGoals: { newCardsPerDay: 10, watchMinutesPerDay: 30, bogus: 1 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dailyGoals).toEqual({ newCardsPerDay: 10, watchMinutesPerDay: 30 });
  });

  it("accepts maxReviewsPerDay within its ceiling and rejects above it", () => {
    const ok = parseSettingsInput({ dailyGoals: { maxReviewsPerDay: 200 } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.dailyGoals).toEqual({ maxReviewsPerDay: 200 });
    expect(parseSettingsInput({ dailyGoals: { maxReviewsPerDay: 10000 } }).ok).toBe(false);
    expect(parseSettingsInput({ dailyGoals: { maxReviewsPerDay: 0 } }).ok).toBe(false);
  });

  it("accepts null to clear the goals", () => {
    const r = parseSettingsInput({ dailyGoals: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.dailyGoals).toBeNull();
  });

  it("rejects a non-object dailyGoals", () => {
    expect(parseSettingsInput({ dailyGoals: "lots" }).ok).toBe(false);
  });

  it("rejects negative, zero, or fractional goal values", () => {
    expect(parseSettingsInput({ dailyGoals: { newCardsPerDay: -1 } }).ok).toBe(false);
    expect(parseSettingsInput({ dailyGoals: { newCardsPerDay: 0 } }).ok).toBe(false);
    expect(parseSettingsInput({ dailyGoals: { watchMinutesPerDay: 2.5 } }).ok).toBe(false);
  });

  it("rejects absurd goal values", () => {
    expect(parseSettingsInput({ dailyGoals: { newCardsPerDay: 501 } }).ok).toBe(false);
    expect(parseSettingsInput({ dailyGoals: { watchMinutesPerDay: 1441 } }).ok).toBe(false);
    expect(parseSettingsInput({ dailyGoals: { reviewMinutesPerDay: 1441 } }).ok).toBe(false);
  });

  it("omits dailyGoals when not provided", () => {
    const r = parseSettingsInput({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.dailyGoals).toBeUndefined();
  });
});

describe("parseSettingsInput", () => {
  it("accepts a valid provider, language, and key (action=set)", () => {
    const r = parseSettingsInput({ llmProvider: "minimax", explanationLanguage: "ja", apiKey: "sk-123" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.llmProvider).toBe("minimax");
    expect(r.value.explanationLanguage).toBe("ja");
    expect(r.value.keyAction).toBe("set");
    expect(r.value.apiKey).toBe("sk-123");
  });

  it("rejects an unknown provider", () => {
    const r = parseSettingsInput({ llmProvider: "bogus" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown explanation language", () => {
    const r = parseSettingsInput({ explanationLanguage: "zz" });
    expect(r.ok).toBe(false);
  });

  it("treats removeKey:true as action=remove and ignores apiKey", () => {
    const r = parseSettingsInput({ removeKey: true, apiKey: "ignored" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.keyAction).toBe("remove");
    expect(r.value.apiKey).toBeUndefined();
  });

  it("treats a missing/empty key as action=keep (no wipe)", () => {
    const empty = parseSettingsInput({ explanationLanguage: "en", apiKey: "   " });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value.keyAction).toBe("keep");

    const absent = parseSettingsInput({ explanationLanguage: "en" });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.keyAction).toBe("keep");
  });

  it("omits fields that were not provided", () => {
    const r = parseSettingsInput({ apiKey: "sk-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.llmProvider).toBeUndefined();
    expect(r.value.explanationLanguage).toBeUndefined();
  });

  it("rejects a non-object body", () => {
    expect(parseSettingsInput(null).ok).toBe(false);
    expect(parseSettingsInput("nope").ok).toBe(false);
  });

  it("treats an empty object body as a no-op (keyAction keep, no fields)", () => {
    const r = parseSettingsInput({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.keyAction).toBe("keep");
    expect(r.value.llmProvider).toBeUndefined();
    expect(r.value.explanationLanguage).toBeUndefined();
  });

  it("treats removeKey:false with a key as action=set", () => {
    const r = parseSettingsInput({ removeKey: false, apiKey: "sk-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.keyAction).toBe("set");
    expect(r.value.apiKey).toBe("sk-1");
  });
});
