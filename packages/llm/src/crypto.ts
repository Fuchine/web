// BYOK key encryption (CONTRATO_IA §6.3). Keys are AES-256-GCM ciphertext
// before they touch the DB — never plaintext, never logged.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce size
const TAG_LENGTH = 16;

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      "FUCHINE_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }
  return key;
}

/** Encrypt a plaintext API key. Returns base64(iv | authTag | ciphertext). */
export function encryptApiKey(plaintext: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a value produced by {@link encryptApiKey}. */
export function decryptApiKey(payloadBase64: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const payload = Buffer.from(payloadBase64, "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
