import { describe, it, expect, vi } from "vitest";
import { confirmationMatches, deleteAccount } from "./account";

describe("confirmationMatches", () => {
  it("matches ignoring case and surrounding whitespace", () => {
    expect(confirmationMatches("  Me@Example.com ", "me@example.com")).toBe(true);
  });
  it("does not match a different string", () => {
    expect(confirmationMatches("nope", "me@example.com")).toBe(false);
  });
  it("never matches when the email is empty", () => {
    expect(confirmationMatches("", "")).toBe(false);
  });
});

// A minimal chainable fake for `db.delete(table).where(cond)` (awaitable).
function fakeDb() {
  const where = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn(() => ({ where }));
  return { db: { delete: del } as never, del, where };
}

describe("deleteAccount", () => {
  it("returns 400 and deletes nothing on a mismatched confirmation", async () => {
    const { db, del } = fakeDb();
    const res = await deleteAccount(db, "u1", "wrong", "me@example.com");
    expect(res.status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes the user and returns 200 on a matching confirmation", async () => {
    const { db, del, where } = fakeDb();
    const res = await deleteAccount(db, "u1", " me@example.com ", "me@example.com");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(del).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
