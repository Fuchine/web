import { describe, expect, test } from "vitest";
import { parseImportResult, EXT_SOURCE } from "./extension-bridge";

const msg = (over: Record<string, unknown> = {}) => ({
  source: EXT_SOURCE,
  type: "IMPORT_RESULT",
  videoId: "abc123",
  ok: true,
  lines: 42,
  ...over,
});

describe("parseImportResult", () => {
  test("returns a normalized result for a matching message", () => {
    expect(parseImportResult(msg(), "abc123")).toEqual({
      ok: true,
      lines: 42,
      error: undefined,
    });
  });

  test("carries the error string through when present", () => {
    expect(parseImportResult(msg({ ok: false, lines: undefined, error: "No Japanese subtitles" }), "abc123"))
      .toEqual({ ok: false, lines: undefined, error: "No Japanese subtitles" });
  });

  test("ignores messages for a different video", () => {
    expect(parseImportResult(msg({ videoId: "other" }), "abc123")).toBeNull();
  });

  test("ignores messages from a foreign source or wrong type", () => {
    expect(parseImportResult(msg({ source: "evil" }), "abc123")).toBeNull();
    expect(parseImportResult(msg({ type: "NOPE" }), "abc123")).toBeNull();
  });

  test("ignores malformed payloads", () => {
    expect(parseImportResult(null, "abc123")).toBeNull();
    expect(parseImportResult("string", "abc123")).toBeNull();
    expect(parseImportResult(42, "abc123")).toBeNull();
  });
});
