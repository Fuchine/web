import { describe, it, expect } from "vitest";
import { randomBytes, createCipheriv } from "node:crypto";
import { encryptApiKey, decryptApiKey } from "./crypto";

const KEY = randomBytes(32).toString("base64");

/** Build a legacy v1 payload (bare base64, no version prefix) for the same key. */
function encryptV1(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

describe("crypto", () => {
  it("round-trips a key and tags it v2", () => {
    const enc = encryptApiKey("sk-secret-123", KEY);
    expect(enc.startsWith("v2:")).toBe(true);
    expect(decryptApiKey(enc, KEY)).toBe("sk-secret-123");
  });

  it("decrypts legacy v1 ciphertext (no prefix)", () => {
    const v1 = encryptV1("sk-legacy-456", KEY);
    expect(v1.startsWith("v2:")).toBe(false);
    expect(decryptApiKey(v1, KEY)).toBe("sk-legacy-456");
  });

  it("rejects a wrong key", () => {
    const enc = encryptApiKey("sk-secret", KEY);
    const otherKey = randomBytes(32).toString("base64");
    expect(() => decryptApiKey(enc, otherKey)).toThrow();
  });

  it("rejects a tampered payload", () => {
    const enc = encryptApiKey("sk-secret", KEY);
    // Flip a byte in the base64 body (after the prefix).
    const body = enc.slice(3);
    const flipped = "v2:" + (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(() => decryptApiKey(flipped, KEY)).toThrow();
  });

  it("rejects a non-32-byte key", () => {
    const shortKey = randomBytes(16).toString("base64");
    expect(() => encryptApiKey("x", shortKey)).toThrow(/32-byte/);
  });
});
