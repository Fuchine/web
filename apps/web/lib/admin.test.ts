import { describe, expect, it } from "vitest";
import { adminDenial, adminEmails, isAdminEmail } from "./admin";
import { readBodyCapped } from "./body";

describe("ADMIN_EMAILS", () => {
  const env = { ADMIN_EMAILS: " Admin@Example.com, ,not-an-email, ops@x.io " };
  it("parses and normalizes the list", () => {
    expect([...adminEmails(env)]).toEqual(["admin@example.com", "ops@x.io"]);
  });
  it("matches case-insensitively; unset = nobody", () => {
    expect(isAdminEmail("ADMIN@example.com", env)).toBe(true);
    expect(isAdminEmail("user@example.com", env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail("admin@example.com", {})).toBe(false);
  });
  it("adminDenial: 401 without a session, 403 for a non-admin", () => {
    expect(adminDenial(null)?.status).toBe(401);
    expect(adminDenial({ user: { id: "u", email: "nobody@example.com" } })?.status).toBe(403);
  });
});

describe("readBodyCapped", () => {
  const req = (body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
    new Request("http://x.test/", { method: "POST", body, headers });
  it("reads a body under the cap", async () => {
    expect(await readBodyCapped(req(new Uint8Array([1, 2, 3])), 10)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("rejects by Content-Length and by counted bytes", async () => {
    expect(await readBodyCapped(req(new Uint8Array(4), { "content-length": "999" }), 10)).toBe("too_large");
    expect(await readBodyCapped(req(new Uint8Array(11)), 10)).toBe("too_large");
  });
});
