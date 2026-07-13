import { describe, it, expect } from "vitest";
import { hasHouseLlm } from "./prewarm";

describe("hasHouseLlm", () => {
  it("is false when unset (defaults to echo)", () => {
    expect(hasHouseLlm({})).toBe(false);
  });

  it("is false for the echo provider", () => {
    expect(hasHouseLlm({ LLM_PROVIDER: "echo" })).toBe(false);
  });

  it("is true for a real provider", () => {
    expect(hasHouseLlm({ LLM_PROVIDER: "minimax" })).toBe(true);
    expect(hasHouseLlm({ LLM_PROVIDER: "openai" })).toBe(true);
  });
});
