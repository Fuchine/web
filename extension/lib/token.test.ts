import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASE,
  importRequestInit,
  isApiTokenFormat,
  normalizeToken,
  tokenForOrigin,
  unauthorizedMessage,
} from "./instance";

const TOKEN = `fch_${"aB3".repeat(14)}x`; // 43 chars after the prefix

describe("API token helpers", () => {
  it("accepts only well-formed tokens", () => {
    expect(TOKEN.length).toBe(47);
    expect(isApiTokenFormat(TOKEN)).toBe(true);
    expect(isApiTokenFormat(TOKEN.slice(0, -1))).toBe(false);
    expect(isApiTokenFormat(`${TOKEN} `)).toBe(false);
    expect(isApiTokenFormat("fch_")).toBe(false);
    expect(isApiTokenFormat(undefined)).toBe(false);
    expect(normalizeToken(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(normalizeToken(undefined)).toBe("");
  });

  it("only hands the token to the configured instance", () => {
    const stored = { base: "https://fuchine.example.com/", apiToken: TOKEN };
    expect(tokenForOrigin(stored, "https://fuchine.example.com")).toBe(TOKEN);
    expect(tokenForOrigin(stored, "https://fuchine.example.com/import")).toBe(TOKEN);
    expect(tokenForOrigin(stored, "https://other.example.com")).toBeNull();
    expect(tokenForOrigin(stored, "http://fuchine.example.com")).toBeNull();
    expect(tokenForOrigin({ apiToken: TOKEN }, DEFAULT_BASE)).toBe(TOKEN); // unset base = dev default
    expect(tokenForOrigin({ base: stored.base }, "https://fuchine.example.com")).toBeNull();
    expect(tokenForOrigin({ base: stored.base, apiToken: "  " }, "https://fuchine.example.com")).toBeNull();
    expect(tokenForOrigin(stored, "not a url")).toBeNull();
  });

  it("builds a Bearer request without cookies, or the legacy cookie request", () => {
    const withToken = importRequestInit({ a: 1 }, TOKEN);
    expect(withToken.method).toBe("POST");
    expect((withToken.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(withToken.credentials).toBe("omit");
    expect(withToken.body).toBe('{"a":1}');

    const legacy = importRequestInit({ a: 1 }, null);
    expect((legacy.headers as Record<string, string>).authorization).toBeUndefined();
    expect(legacy.credentials).toBe("include");
  });

  it("explains a 401 differently with and without a token", () => {
    expect(unauthorizedMessage(true)).toMatch(/^Token invalid or revoked/);
    expect(unauthorizedMessage(false)).toMatch(/Sign in/);
  });
});
