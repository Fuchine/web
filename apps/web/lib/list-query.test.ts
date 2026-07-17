import { describe, it, expect } from "vitest";
import { decodeListCursor, encodeListCursor, escapeLike } from "./list-query";
import { phraseRank } from "./phrases";

describe("list cursor", () => {
  it("round-trips numbers, ids and free text (colons, Japanese)", () => {
    const parts = [1234, "a:b:c", "見つかった?", null];
    expect(decodeListCursor(encodeListCursor(parts))).toEqual(parts);
  });

  it("keeps the payload base64url (no +, / or = to mangle in a query string)", () => {
    const cursor = encodeListCursor(["日本語のテキスト+/=", "id-1"]);
    expect(cursor).toMatch(/^k:[A-Za-z0-9_-]+$/);
  });

  it("rejects malformed cursors instead of throwing", () => {
    expect(decodeListCursor("t:123:id")).toBeNull(); // legacy format is not k:
    expect(decodeListCursor("k:not-base64-json")).toBeNull();
    expect(decodeListCursor("k:" + Buffer.from('{"a":1}').toString("base64url"))).toBeNull();
    expect(decodeListCursor("k:" + Buffer.from('[{"a":1}]').toString("base64url"))).toBeNull();
  });
});

describe("escapeLike", () => {
  it("escapes LIKE metacharacters so they match literally", () => {
    expect(escapeLike("100%_done\\x")).toBe("100\\%\\_done\\\\x");
    expect(escapeLike("plain text")).toBe("plain text");
  });
});

describe("phraseRank", () => {
  const now = new Date("2026-07-17T12:00:00Z");
  const past = new Date("2026-07-16T12:00:00Z");
  const future = new Date("2026-07-18T12:00:00Z");

  it("mirrors the client's deriveStatus order (due < learning < new < known)", () => {
    expect(phraseRank(2, past, now)).toBe(0);   // review card past due → due
    expect(phraseRank(2, now, now)).toBe(0);    // exactly due counts as due
    expect(phraseRank(1, future, now)).toBe(1); // learning
    expect(phraseRank(3, future, now)).toBe(1); // relearning → learning
    expect(phraseRank(0, future, now)).toBe(2); // new
    expect(phraseRank(2, future, now)).toBe(3); // review not yet due → known
  });
});
