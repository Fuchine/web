import { describe, it, expect } from "vitest";
import { METADATA_MAX_AGE_DAYS, staleCutoff } from "./metadata";

describe("metadata freshness", () => {
  it("uses a 30-day horizon by default", () => {
    expect(METADATA_MAX_AGE_DAYS).toBe(30);
    const now = new Date("2026-10-30T12:00:00Z");
    expect(staleCutoff(now).toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(staleCutoff(now, 7).toISOString()).toBe("2026-10-23T12:00:00.000Z");
  });
});
