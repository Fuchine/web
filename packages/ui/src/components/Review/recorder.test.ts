import { describe, expect, test } from "vitest";
import { classifyMicError, formatTakeTime, pickRecorderMime, recorderMessage, recorderSupported } from "./recorder";

describe("recorderSupported", () => {
  const getUserMedia = () => undefined;
  class FakeRecorder {}

  test("needs getUserMedia, MediaRecorder and a secure context", () => {
    expect(recorderSupported({ mediaDevices: { getUserMedia }, MediaRecorder: FakeRecorder, isSecureContext: true })).toBe(true);
    expect(recorderSupported({ mediaDevices: { getUserMedia }, MediaRecorder: undefined, isSecureContext: true })).toBe(false);
    expect(recorderSupported({ mediaDevices: undefined, MediaRecorder: FakeRecorder })).toBe(false);
    expect(recorderSupported({ mediaDevices: { getUserMedia }, MediaRecorder: FakeRecorder, isSecureContext: false })).toBe(false);
    expect(recorderSupported({})).toBe(false);
  });
});

describe("pickRecorderMime", () => {
  test("first supported container in preference order", () => {
    expect(pickRecorderMime((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMime((t) => t === "audio/mp4")).toBe("audio/mp4"); // Safari
  });

  test("undefined when nothing matches, the probe is missing, or it throws", () => {
    expect(pickRecorderMime(() => false)).toBeUndefined();
    expect(pickRecorderMime(undefined)).toBeUndefined();
    expect(pickRecorderMime(() => { throw new Error("boom"); })).toBeUndefined();
  });
});

describe("classifyMicError", () => {
  test("permission errors → denied, missing device → no-device, else error", () => {
    expect(classifyMicError({ name: "NotAllowedError" })).toBe("denied");
    expect(classifyMicError({ name: "SecurityError" })).toBe("denied");
    expect(classifyMicError({ name: "NotFoundError" })).toBe("no-device");
    expect(classifyMicError({ name: "NotReadableError" })).toBe("error");
    expect(classifyMicError(new Error("x"))).toBe("error");
    expect(classifyMicError(null)).toBe("error");
  });
});

describe("recorderMessage / formatTakeTime", () => {
  test("degraded states explain themselves; normal states say nothing", () => {
    for (const s of ["denied", "no-device", "unsupported", "error"] as const) {
      expect(recorderMessage(s)).toMatch(/\S/);
    }
    for (const s of ["idle", "requesting", "recording", "ready"] as const) {
      expect(recorderMessage(s)).toBeNull();
    }
  });

  test("formats seconds as 0:SS", () => {
    expect(formatTakeTime(0)).toBe("0:00");
    expect(formatTakeTime(4_900)).toBe("0:04");
    expect(formatTakeTime(30_000)).toBe("0:30");
    expect(formatTakeTime(-5)).toBe("0:00");
  });
});
