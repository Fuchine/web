import { describe, it, expect, beforeEach } from "vitest";
import { EchoProvider, FallbackProvider } from "@fuchine/llm";
import { houseMtProvider } from "./house-provider";

beforeEach(() => {
  delete process.env.MT_PROVIDER;
  delete process.env.MT_API_KEY;
  delete process.env.MT_BASE_URL;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
});

describe("houseMtProvider", () => {
  it("without MT_PROVIDER, is exactly the house provider (echo by default)", () => {
    expect(houseMtProvider()).toBeInstanceOf(EchoProvider);
  });

  it("with MT_PROVIDER=deepl, wraps DeepL with the house LLM as fallback", () => {
    process.env.MT_PROVIDER = "deepl";
    process.env.MT_API_KEY = "test-key:fx";
    const p = houseMtProvider();
    expect(p).toBeInstanceOf(FallbackProvider);
    expect((p as FallbackProvider).name).toBe("fallback(deepl→echo)");
  });
});
