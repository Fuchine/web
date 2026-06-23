import { describe, it, expect } from "vitest";
import { parseSettingsInput } from "./settings";

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
});
