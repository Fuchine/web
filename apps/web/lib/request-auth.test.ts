import { describe, it, expect, vi } from "vitest";

import { authenticateRequest, unauthorizedResponseInit, type RequestAuthDeps } from "./request-auth";
import { generateApiToken } from "./api-tokens";

const TOKEN = generateApiToken();

function deps(over: Partial<RequestAuthDeps> = {}): RequestAuthDeps {
  return {
    session: vi.fn(async () => null),
    verifyToken: vi.fn(async () => ({ ok: false as const, reason: "unknown" as const })),
    ...over,
  };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("http://fuchine.test/api/import", { method: "POST", headers });

describe("authenticateRequest", () => {
  it("accepts the session when no Bearer is sent", async () => {
    const d = deps({ session: vi.fn(async () => ({ user: { id: "u1" } })) });
    expect(await authenticateRequest(req(), "import", d)).toEqual({ ok: true, userId: "u1", via: "session" });
    expect(d.verifyToken).not.toHaveBeenCalled();
  });

  it("is unauthorized without session and token", async () => {
    const r = await authenticateRequest(req(), "import", deps());
    expect(r).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("accepts a valid Bearer token for the requested scope", async () => {
    const verifyToken = vi.fn(async () => ({ ok: true as const, userId: "u2", tokenId: "t1" }));
    const d = deps({ verifyToken });
    const r = await authenticateRequest(req({ authorization: `Bearer ${TOKEN}` }), "import", d);
    expect(r).toEqual({ ok: true, userId: "u2", via: "token", tokenId: "t1" });
    expect(verifyToken).toHaveBeenCalledWith(TOKEN, "import");
    expect(d.session).not.toHaveBeenCalled();
  });

  it("rejects a bad/revoked token even when a session exists (no silent cookie fallback)", async () => {
    for (const reason of ["unknown", "revoked", "scope", "malformed"] as const) {
      const d = deps({
        session: vi.fn(async () => ({ user: { id: "u1" } })),
        verifyToken: vi.fn(async () => ({ ok: false as const, reason })),
      });
      const r = await authenticateRequest(req({ authorization: `Bearer ${TOKEN}` }), "import", d);
      expect(r).toMatchObject({ ok: false, error: "invalid_token", message: "Token invalid or revoked" });
      expect(d.session).not.toHaveBeenCalled();
    }
  });

  it("ignores non-Bearer Authorization schemes (falls to the session)", async () => {
    const d = deps({ session: vi.fn(async () => ({ user: { id: "u1" } })) });
    const r = await authenticateRequest(req({ authorization: "Basic dXNlcjpwYXNz" }), "import", d);
    expect(r).toMatchObject({ ok: true, via: "session" });
    expect(d.verifyToken).not.toHaveBeenCalled();
  });
});

describe("unauthorizedResponseInit", () => {
  it("names the token failure and sets WWW-Authenticate", () => {
    const r = unauthorizedResponseInit({ ok: false, error: "invalid_token", message: "Token invalid or revoked" });
    expect(r.init.status).toBe(401);
    expect(r.body).toEqual({ error: "Token invalid or revoked", code: "invalid_token" });
    expect(r.init.headers?.["WWW-Authenticate"]).toContain("invalid_token");
  });

  it("is a plain 401 without a token", () => {
    const r = unauthorizedResponseInit({ ok: false, error: "unauthorized", message: "unauthorized" });
    expect(r.body).toEqual({ error: "unauthorized" });
    expect(r.init.headers).toBeUndefined();
  });
});
