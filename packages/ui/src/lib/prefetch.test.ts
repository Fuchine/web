import { describe, it, expect } from "vitest";
import { pickPrefetchTarget } from "./prefetch";

const lines = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];

const state = (over: Partial<Record<"has" | "pending" | "failed", string[]>> = {}) => ({
  has: (id: string) => (over.has ?? []).includes(id),
  pending: (id: string) => (over.pending ?? []).includes(id),
  failed: (id: string) => (over.failed ?? []).includes(id),
});

describe("pickPrefetchTarget", () => {
  it("picks the first line after the base position", () => {
    expect(pickPrefetchTarget(lines, 0, 4, state())?.id).toBe("b");
  });

  it("skips cached, pending, and failed lines", () => {
    expect(
      pickPrefetchTarget(lines, 0, 4, state({ has: ["b"], pending: ["c"], failed: ["d"] }))?.id,
    ).toBe("e");
  });

  it("respects the look-ahead window", () => {
    expect(pickPrefetchTarget(lines, 0, 2, state({ has: ["b", "c"] }))).toBeNull();
  });

  it("returns null before playback starts (base < 0)", () => {
    expect(pickPrefetchTarget(lines, -1, 4, state())).toBeNull();
  });

  it("stops at the end of the transcript", () => {
    expect(pickPrefetchTarget(lines, 4, 4, state())).toBeNull();
  });
});
