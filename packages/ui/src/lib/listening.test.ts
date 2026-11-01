import { describe, it, expect } from "vitest";
import {
  DEFAULT_PLAYER_PREFS,
  PLAYER_PREFS_KEY,
  PRIMED_IDLE,
  PRIMED_PREVIEW_MS,
  PRIMED_REVEAL_MS,
  lineAtOrAfter,
  loadPlayerPrefs,
  nextInCycle,
  parsePlayerPrefs,
  primedStep,
  savePlayerPrefs,
  showReadingFor,
  statusOf,
  subtitleVisibility,
  type PrimedContext,
  type PrimedState,
} from "./listening";

const lines = [
  { tStartMs: 1000, tEndMs: 3000 },
  { tStartMs: 3000, tEndMs: 5000 },
  { tStartMs: 6000, tEndMs: 8000, preview: false },
];
const ctx: PrimedContext = { lines, loop: false };

describe("primedStep", () => {
  it("start from idle previews the line: pause, seek to its start, arm the preview timer", () => {
    const r = primedStep(PRIMED_IDLE, { type: "start", lineIdx: 0 }, ctx);
    expect(r.state).toEqual({ phase: "preview", lineIdx: 0 });
    expect(r.effects).toEqual([
      { type: "pause" },
      { type: "seek", ms: 1000 },
      { type: "timer", ms: PRIMED_PREVIEW_MS },
    ]);
  });

  it("start is ignored mid-cycle (our own play() echoes back as 'playing')", () => {
    const s: PrimedState = { phase: "listen", lineIdx: 1 };
    expect(primedStep(s, { type: "start", lineIdx: 0 }, ctx)).toEqual({ state: s, effects: [] });
  });

  it("preview timer → listen and play", () => {
    const r = primedStep({ phase: "preview", lineIdx: 0 }, { type: "timer" }, ctx);
    expect(r.state).toEqual({ phase: "listen", lineIdx: 0 });
    expect(r.effects).toEqual([{ type: "play" }]);
  });

  it("listen ticks before the line end change nothing", () => {
    const s: PrimedState = { phase: "listen", lineIdx: 0 };
    expect(primedStep(s, { type: "tick", ms: 2999 }, ctx)).toEqual({ state: s, effects: [] });
  });

  it("reaching the line end reveals: pause and arm the reveal timer", () => {
    const r = primedStep({ phase: "listen", lineIdx: 0 }, { type: "tick", ms: 3100 }, ctx);
    expect(r.state).toEqual({ phase: "reveal", lineIdx: 0 });
    expect(r.effects).toEqual([{ type: "pause" }, { type: "timer", ms: PRIMED_REVEAL_MS }]);
  });

  it("ticks outside listen are ignored", () => {
    const s: PrimedState = { phase: "preview", lineIdx: 0 };
    expect(primedStep(s, { type: "tick", ms: 99_000 }, ctx).state).toBe(s);
  });

  it("reveal timer advances to the next line's preview", () => {
    const r = primedStep({ phase: "reveal", lineIdx: 0 }, { type: "timer" }, ctx);
    expect(r.state).toEqual({ phase: "preview", lineIdx: 1 });
    expect(r.effects[1]).toEqual({ type: "seek", ms: 3000 });
  });

  it("loop-line replays the same line after the reveal", () => {
    const r = primedStep({ phase: "reveal", lineIdx: 1 }, { type: "timer" }, { lines, loop: true });
    expect(r.state).toEqual({ phase: "preview", lineIdx: 1 });
    expect(r.effects).toContainEqual({ type: "seek", ms: 3000 });
  });

  it("a line with nothing to preview goes straight to listen", () => {
    const r = primedStep({ phase: "reveal", lineIdx: 1 }, { type: "timer" }, ctx);
    expect(r.state).toEqual({ phase: "listen", lineIdx: 2 });
    expect(r.effects).toEqual([{ type: "seek", ms: 6000 }, { type: "play" }]);
  });

  it("after the last line's reveal it stops, paused on that line", () => {
    const r = primedStep({ phase: "reveal", lineIdx: 2 }, { type: "timer" }, ctx);
    expect(r.state).toEqual({ phase: "idle", lineIdx: 2 });
    expect(r.effects).toEqual([]);
  });

  it("seek mid-cycle restarts the cycle on the target line; ignored when idle", () => {
    const r = primedStep({ phase: "listen", lineIdx: 0 }, { type: "seek", lineIdx: 1 }, ctx);
    expect(r.state).toEqual({ phase: "preview", lineIdx: 1 });
    expect(primedStep(PRIMED_IDLE, { type: "seek", lineIdx: 1 }, ctx).state).toBe(PRIMED_IDLE);
  });

  it("seek to a line out of range goes idle", () => {
    expect(primedStep({ phase: "listen", lineIdx: 0 }, { type: "seek", lineIdx: 9 }, ctx).state.phase).toBe("idle");
  });

  it("user pause stops the cycle; only listen needs an explicit pause", () => {
    expect(primedStep({ phase: "listen", lineIdx: 0 }, { type: "userPause" }, ctx)).toEqual({
      state: { phase: "idle", lineIdx: 0 },
      effects: [{ type: "pause" }],
    });
    expect(primedStep({ phase: "preview", lineIdx: 0 }, { type: "userPause" }, ctx).effects).toEqual([]);
  });

  it("exit hands playback back: resumes when the machine held the video paused", () => {
    expect(primedStep({ phase: "reveal", lineIdx: 0 }, { type: "exit" }, ctx).effects).toEqual([{ type: "play" }]);
    expect(primedStep({ phase: "listen", lineIdx: 0 }, { type: "exit" }, ctx).effects).toEqual([]);
    expect(primedStep(PRIMED_IDLE, { type: "exit" }, ctx).effects).toEqual([]);
  });

  it("runs a full cycle over the video", () => {
    let s: PrimedState = PRIMED_IDLE;
    const phases: string[] = [];
    const step = (e: Parameters<typeof primedStep>[1]) => {
      s = primedStep(s, e, ctx).state;
      phases.push(`${s.phase}:${s.lineIdx}`);
    };
    step({ type: "start", lineIdx: 0 });
    step({ type: "timer" });
    step({ type: "tick", ms: 3000 });
    step({ type: "timer" });
    step({ type: "timer" });
    step({ type: "tick", ms: 5250 });
    step({ type: "timer" });
    step({ type: "tick", ms: 8000 });
    step({ type: "timer" });
    expect(phases).toEqual([
      "preview:0", "listen:0", "reveal:0",
      "preview:1", "listen:1", "reveal:1",
      "listen:2", "reveal:2", "idle:2",
    ]);
  });
});

describe("subtitleVisibility", () => {
  const all = { japanese: true, translation: true };
  it("preview shows only the translation; listen hides both; reveal/idle follow the toggles", () => {
    expect(subtitleVisibility("preview", all)).toEqual({ japanese: false, translation: true });
    expect(subtitleVisibility("listen", all)).toEqual({ japanese: false, translation: false });
    expect(subtitleVisibility("reveal", all)).toEqual(all);
    expect(subtitleVisibility("idle", all)).toEqual(all);
  });
  it("user toggles are a ceiling in every phase", () => {
    const none = { japanese: false, translation: false };
    for (const p of ["idle", "preview", "listen", "reveal"] as const) {
      expect(subtitleVisibility(p, none)).toEqual(none);
    }
  });
});

describe("lineAtOrAfter", () => {
  it("finds the line under the playhead, else the next one, else -1", () => {
    expect(lineAtOrAfter(lines, 1500)).toBe(0);
    expect(lineAtOrAfter(lines, 0)).toBe(0);
    expect(lineAtOrAfter(lines, 5500)).toBe(2);
    expect(lineAtOrAfter(lines, 9000)).toBe(-1);
  });
});

describe("player prefs", () => {
  it("parses valid prefs and falls back field by field", () => {
    expect(parsePlayerPrefs(null)).toEqual(DEFAULT_PLAYER_PREFS);
    expect(parsePlayerPrefs("{not json")).toEqual(DEFAULT_PLAYER_PREFS);
    expect(parsePlayerPrefs("42")).toEqual(DEFAULT_PLAYER_PREFS);
    expect(
      parsePlayerPrefs(JSON.stringify({ listeningMode: "primed", showJapanese: false, colorKnown: "yes", furigana: "unknown" })),
    ).toEqual({ ...DEFAULT_PLAYER_PREFS, listeningMode: "primed", showJapanese: false, furigana: "unknown" });
    expect(parsePlayerPrefs(JSON.stringify({ listeningMode: "turbo" })).listeningMode).toBe("normal");
  });

  it("round-trips through storage and survives a throwing storage", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const prefs = { ...DEFAULT_PLAYER_PREFS, listeningMode: "primed" as const };
    savePlayerPrefs(storage, prefs);
    expect(mem.has(PLAYER_PREFS_KEY)).toBe(true);
    expect(loadPlayerPrefs(storage)).toEqual(prefs);

    const broken = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceeded"); },
    };
    expect(loadPlayerPrefs(broken)).toEqual(DEFAULT_PLAYER_PREFS);
    expect(() => savePlayerPrefs(broken, prefs)).not.toThrow();
    expect(loadPlayerPrefs(undefined)).toEqual(DEFAULT_PLAYER_PREFS);
  });

  it("cycles values", () => {
    expect(nextInCycle(["off", "all", "unknown"], "off")).toBe("all");
    expect(nextInCycle(["off", "all", "unknown"], "unknown")).toBe("off");
  });
});

describe("known-word helpers", () => {
  it("statusOf defaults to unknown", () => {
    expect(statusOf({ w1: "known" }, "w1")).toBe("known");
    expect(statusOf({ w1: "known" }, "w2")).toBe("unknown");
    expect(statusOf(undefined, "w1")).toBe("unknown");
    expect(statusOf({ w1: "known" }, null)).toBe("unknown");
  });

  it("furigana: unknown-only hides readings for known words", () => {
    expect(showReadingFor("off", "unknown")).toBe(false);
    expect(showReadingFor("all", "known")).toBe(true);
    expect(showReadingFor("unknown", "known")).toBe(false);
    expect(showReadingFor("unknown", "seen")).toBe(true);
  });
});
