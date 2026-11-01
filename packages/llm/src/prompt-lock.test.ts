import { describe, expect, it } from "vitest";
import { PROMPT_VERSION } from "./contract";
import {
  checkPromptLock,
  hashPrompts,
  readCurrentLockState,
  readLockFile,
  readPromptVersion,
} from "./prompt-lock";

describe("prompt version lock (CI guard)", () => {
  it("prompts.ts matches the hash pinned for the current PROMPT_VERSION", () => {
    const verdict = checkPromptLock(readCurrentLockState(), readLockFile());
    // On failure the message says exactly what to do.
    expect(verdict.ok ? "ok" : verdict.message).toBe("ok");
  });

  it("reads the same PROMPT_VERSION the code exports", () => {
    expect(readCurrentLockState().promptVersion).toBe(PROMPT_VERSION);
  });
});

describe("checkPromptLock", () => {
  const lock = { promptVersion: 2, promptsSha256: "aaa" };

  it("passes when version and hash match", () => {
    expect(checkPromptLock({ promptVersion: 2, promptsSha256: "aaa" }, lock)).toEqual({ ok: true });
  });

  it("fails a prompt edit without a version bump", () => {
    const v = checkPromptLock({ promptVersion: 2, promptsSha256: "bbb" }, lock);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("prompt_changed_without_bump");
      expect(v.message).toMatch(/bump PROMPT_VERSION/);
    }
  });

  it("asks to re-pin after a bump (stale lock), with or without a prompt change", () => {
    for (const hash of ["aaa", "bbb"]) {
      const v = checkPromptLock({ promptVersion: 3, promptsSha256: hash }, lock);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe("stale_lock");
    }
  });

  it("rejects a version downgrade", () => {
    const v = checkPromptLock({ promptVersion: 1, promptsSha256: "aaa" }, lock);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("version_downgrade");
  });
});

describe("helpers", () => {
  it("hash ignores CRLF vs LF", () => {
    expect(hashPrompts("a\r\nb\r\n")).toBe(hashPrompts("a\nb\n"));
    expect(hashPrompts("a\nb")).not.toBe(hashPrompts("a\nc"));
  });

  it("parses PROMPT_VERSION from source", () => {
    expect(readPromptVersion("export const PROMPT_VERSION = 7;")).toBe(7);
    expect(() => readPromptVersion("const X = 1;")).toThrow();
  });
});
