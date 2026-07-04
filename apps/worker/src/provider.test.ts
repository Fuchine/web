import { describe, it, expect } from "vitest";
import { hasHouseLlm } from "./provider";

// Env is injected (not stubbed globally) so tests can't leak state — the
// repo's review follow-up on env handling in provider tests.
describe("hasHouseLlm", () => {
  it("is false when LLM_PROVIDER is unset (echo default would fail every line)", () => {
    expect(hasHouseLlm({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("is false when LLM_PROVIDER is explicitly echo", () => {
    expect(hasHouseLlm({ LLM_PROVIDER: "echo" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("is true for a real provider", () => {
    expect(
      hasHouseLlm({ LLM_PROVIDER: "openai-compatible" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
