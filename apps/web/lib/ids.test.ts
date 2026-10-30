import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("accepts canonical uuids, any case", () => {
    const id = randomUUID();
    expect(isUuid(id)).toBe(true);
    expect(isUuid(id.toUpperCase())).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects anything Postgres would choke on (or that isn't a string)", () => {
    for (const bad of ["abc", "", "1", `${randomUUID()}x`, ` ${randomUUID()}`, "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", "' OR 1=1 --"]) {
      expect(isUuid(bad)).toBe(false);
    }
    for (const bad of [undefined, null, 42, {}, []]) expect(isUuid(bad)).toBe(false);
  });
});
