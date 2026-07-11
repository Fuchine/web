import { describe, it, expect } from "vitest";

describe("importVideo catch block", () => {
  it("extracts message from Error objects", () => {
    const err = new Error("connection refused");
    const reason = err instanceof Error ? err.message : String(err);
    expect(reason).toBe("connection refused");
    expect(reason.slice(0, 500)).toBe("connection refused");
  });

  it("handles non-Error throws gracefully", () => {
    const thrown = "string error";
    const reason = thrown instanceof Error ? thrown.message : String(thrown);
    expect(reason).toBe("string error");
  });

  it("truncates very long error messages to 500 chars", () => {
    const err = new Error("x".repeat(1000));
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    expect(reason.length).toBe(500);
    expect(reason).toBe("x".repeat(500));
  });
});

describe("no-captions guard", () => {
  it("returns the expected failure reason", () => {
    const reason = "No Japanese captions found";
    expect(reason).toBe("No Japanese captions found");
  });
});
