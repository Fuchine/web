// Boot-time validation of FUCHINE_ENCRYPTION_KEY (C6). The BYOK cipher
// (`@fuchine/llm` crypto.ts) needs a base64-encoded 32-byte AES-256 key; a key
// of the wrong size used to pass the presence check and only blow up on the
// first `PATCH /api/settings` that stores a key. Pure, so it's unit-tested.

const BASE64_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** Returns an error message for a missing/malformed key, or null when usable. */
export function encryptionKeyProblem(raw: string | undefined): string | null {
  if (!raw) return "FUCHINE_ENCRYPTION_KEY (openssl rand -base64 32)";
  const v = raw.trim();
  if (!BASE64_RE.test(v) || Buffer.from(v, "base64").length !== 32) {
    return "FUCHINE_ENCRYPTION_KEY must be base64 that decodes to exactly 32 bytes (openssl rand -base64 32)";
  }
  return null;
}
