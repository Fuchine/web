// Admin gate of the dictionary routes (T3.4): a signed-in non-admin gets 403
// before the body is read or the database is touched; an admin's oversized
// upload is refused (413) without touching the database either.

import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      throw new Error(`db.${String(prop)} used`);
    },
  }),
}));

import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";

const ID = "00000000-0000-4000-8000-000000000000";
const ctx = { params: Promise.resolve({ id: ID }) };

function upload(bytes: number, headers: Record<string, string> = {}) {
  return new Request("http://fuchine.test/api/admin/dictionaries", {
    method: "POST",
    headers: { "content-type": "application/zip", ...headers },
    body: new Uint8Array(bytes),
  });
}

describe("admin dictionary routes", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("DICT_MAX_UNCOMPRESSED_MB", "1");
  });

  it("a non-admin is rejected (403) on every method, body unread", async () => {
    session.current = { user: { id: "u1", email: "learner@example.com" } };
    const req = upload(10);
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect((await GET()).status).toBe(403);
    expect((await PATCH(new Request("http://x/", { method: "PATCH", body: "{}" }), ctx)).status).toBe(403);
    expect((await DELETE(new Request("http://x/", { method: "DELETE" }), ctx)).status).toBe(403);
  });

  it("no ADMIN_EMAILS = nobody is an admin", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    session.current = { user: { id: "u1", email: "admin@example.com" } };
    expect((await POST(upload(10))).status).toBe(403);
  });

  it("an admin's upload over DICT_MAX_UNCOMPRESSED_MB is refused (413)", async () => {
    session.current = { user: { id: "u2", email: "Admin@Example.com" } };
    expect((await POST(upload(2 * 1024 * 1024))).status).toBe(413);
  });

  it("an admin's empty upload is a 400, a broken zip a 422 (never the db)", async () => {
    session.current = { user: { id: "u2", email: "admin@example.com" } };
    expect((await POST(upload(0))).status).toBe(400);
    const res = await POST(new Request("http://fuchine.test/api/admin/dictionaries", { method: "POST", body: "not a zip" }));
    expect(res.status).toBe(422);
  });
});
