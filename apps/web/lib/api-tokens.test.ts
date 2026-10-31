import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  DISPLAY_PREFIX_LENGTH,
  NAME_MAX,
  TOKEN_BODY_LENGTH,
  displayPrefix,
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  parseBearer,
  parseTokenName,
} from "./api-tokens";

describe("generateApiToken", () => {
  it("produces fch_ + 43 base62 chars (≥ 256 bits)", () => {
    const t = generateApiToken();
    expect(t).toMatch(/^fch_[0-9A-Za-z]{43}$/);
    expect(t.length).toBe(4 + TOKEN_BODY_LENGTH);
    expect(TOKEN_BODY_LENGTH * Math.log2(62)).toBeGreaterThanOrEqual(256);
    expect(isApiTokenFormat(t)).toBe(true);
  });

  it("never repeats and uses the whole alphabet roughly uniformly", () => {
    const seen = new Set<string>();
    const freq = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const t = generateApiToken();
      expect(seen.has(t)).toBe(false);
      seen.add(t);
      for (const c of t.slice(4)) freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    expect(freq.size).toBe(62);
    const expected = (2000 * TOKEN_BODY_LENGTH) / 62; // ≈ 1387
    for (const n of freq.values()) {
      expect(n).toBeGreaterThan(expected * 0.8);
      expect(n).toBeLessThan(expected * 1.2);
    }
  });
});

describe("isApiTokenFormat", () => {
  it("rejects lookalikes", () => {
    const t = generateApiToken();
    for (const bad of [
      "", "fch_", t.slice(0, -1), `${t}x`, t.replace("fch_", "FCH_"), t.replace("fch_", "fch-"),
      `${t.slice(0, -1)}-`, ` ${t}`, `${t}\n`, 42, null, undefined,
    ]) {
      expect(isApiTokenFormat(bad)).toBe(false);
    }
  });
});

describe("hashApiToken", () => {
  it("is the hex SHA-256 of the whole token, deterministic", () => {
    const t = generateApiToken();
    expect(hashApiToken(t)).toBe(createHash("sha256").update(t).digest("hex"));
    expect(hashApiToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiToken(t)).toBe(hashApiToken(t));
    expect(hashApiToken(t)).not.toBe(hashApiToken(generateApiToken()));
  });

  it("the stored hash and display prefix never contain the secret body", () => {
    const t = generateApiToken();
    expect(displayPrefix(t)).toBe(t.slice(0, DISPLAY_PREFIX_LENGTH));
    expect(displayPrefix(t).startsWith("fch_")).toBe(true);
    expect(hashApiToken(t)).not.toContain(t.slice(4));
  });
});

describe("parseBearer", () => {
  const t = generateApiToken();
  it("extracts the credential of a Bearer header", () => {
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(`bearer ${t}`)).toBe(t);
    expect(parseBearer(`Bearer   ${t}  `)).toBe(t);
  });

  it("returns malformed Bearer credentials as-is so they get rejected, never ignored", () => {
    expect(parseBearer("Bearer not-a-token")).toBe("not-a-token");
    expect(parseBearer(`Bearer ${t} extra`)).toBe(`${t} extra`);
    expect(parseBearer("Bearer")).toBe("");
    expect(parseBearer("Bearer ")).toBe("");
    for (const v of ["not-a-token", `${t} extra`, ""]) expect(isApiTokenFormat(v)).toBe(false);
  });

  it("is null without a Bearer scheme", () => {
    for (const h of [null, undefined, "", `Basic ${t}`, t, `Bearerx ${t}`]) {
      expect(parseBearer(h)).toBeNull();
    }
  });
});

describe("parseTokenName", () => {
  it("trims and bounds the name", () => {
    expect(parseTokenName({ name: "  Laptop Chrome " })).toEqual({ ok: true, name: "Laptop Chrome" });
    expect(parseTokenName({ name: "x".repeat(NAME_MAX) }).ok).toBe(true);
    expect(parseTokenName({ name: "x".repeat(NAME_MAX + 1) }).ok).toBe(false);
    expect(parseTokenName({ name: "   " }).ok).toBe(false);
    expect(parseTokenName({}).ok).toBe(false);
    expect(parseTokenName(null).ok).toBe(false);
    expect(parseTokenName({ name: 5 }).ok).toBe(false);
  });
});
