import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import { encryptionKeyProblem } from "./encryption-key";

describe("encryptionKeyProblem", () => {
  it("accepts a base64 32-byte key", () => {
    expect(encryptionKeyProblem(randomBytes(32).toString("base64"))).toBeNull();
    expect(encryptionKeyProblem(randomBytes(32).toString("base64url"))).toBeNull();
  });

  it("reports a missing key", () => {
    expect(encryptionKeyProblem(undefined)).toMatch(/FUCHINE_ENCRYPTION_KEY/);
    expect(encryptionKeyProblem("")).toMatch(/FUCHINE_ENCRYPTION_KEY/);
  });

  it("rejects keys of the wrong size", () => {
    expect(encryptionKeyProblem(randomBytes(16).toString("base64"))).toMatch(/32 bytes/);
    expect(encryptionKeyProblem(randomBytes(48).toString("base64"))).toMatch(/32 bytes/);
  });

  it("rejects non-base64 text (e.g. a passphrase)", () => {
    expect(encryptionKeyProblem("correct horse battery staple, 32 chars!")).toMatch(/32 bytes/);
  });
});
