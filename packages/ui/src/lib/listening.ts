// Player listening modes (T3.8). Pure — no React, no YouTube — so the timing
// rules are unit-tested; Player.tsx feeds it events and runs the effects.
//
// Primed listening, per line:
//   preview — video paused at the line start, translation shown, JP hidden
//             (PRIMED_PREVIEW_MS)
//   listen  — playing the line audio-first: JP and translation hidden, until
//             the playhead reaches the line end
//   reveal  — paused again, JP (and translation) shown (PRIMED_REVEAL_MS),
//             then on to the next line's preview (or the same line when
//             loop-line is on)
// "idle" means the machine is not driving playback (normal mode, or primed
// while the user has paused).

/** How long the translation is shown, video paused, before the line plays. */
export const PRIMED_PREVIEW_MS = 1500;
/** How long the revealed line is held, video paused, before the next preview. */
export const PRIMED_REVEAL_MS = 2000;

export const LISTENING_MODES = ["normal", "primed"] as const;
export type ListeningMode = (typeof LISTENING_MODES)[number];

export type PrimedPhase = "idle" | "preview" | "listen" | "reveal";

export interface PrimedState {
  phase: PrimedPhase;
  /** Line the machine is working on (meaningful when phase !== "idle"). */
  lineIdx: number;
}

export const PRIMED_IDLE: PrimedState = { phase: "idle", lineIdx: -1 };

export type PrimedLine = {
  tStartMs: number;
  tEndMs: number;
  /** false ⇒ nothing to preview (no translation yet): go straight to listen. */
  preview?: boolean;
};

export type PrimedEvent =
  /** Playback began (or primed was entered while playing) on this line. */
  | { type: "start"; lineIdx: number }
  /** The user jumped to a line (transcript click, j/k, scrub). */
  | { type: "seek"; lineIdx: number }
  /** The current phase's timer elapsed. */
  | { type: "timer" }
  /** Playhead position, polled while playing. */
  | { type: "tick"; ms: number }
  /** The user paused (button or the iframe itself) or the video ended. */
  | { type: "userPause" }
  /** Left primed mode. */
  | { type: "exit" };

export type PrimedEffect =
  | { type: "pause" }
  | { type: "play" }
  | { type: "seek"; ms: number }
  | { type: "timer"; ms: number };

export interface PrimedContext {
  lines: readonly PrimedLine[];
  /** Loop-line: after the reveal, replay the same line instead of advancing. */
  loop: boolean;
}

export interface PrimedResult {
  state: PrimedState;
  effects: PrimedEffect[];
}

const same = (state: PrimedState): PrimedResult => ({ state, effects: [] });

function enterLine(lineIdx: number, ctx: PrimedContext): PrimedResult {
  const line = ctx.lines[lineIdx];
  if (!line) return { state: PRIMED_IDLE, effects: [] };
  if (line.preview === false) {
    return {
      state: { phase: "listen", lineIdx },
      effects: [{ type: "seek", ms: line.tStartMs }, { type: "play" }],
    };
  }
  return {
    state: { phase: "preview", lineIdx },
    effects: [
      { type: "pause" },
      { type: "seek", ms: line.tStartMs },
      { type: "timer", ms: PRIMED_PREVIEW_MS },
    ],
  };
}

export function primedStep(state: PrimedState, event: PrimedEvent, ctx: PrimedContext): PrimedResult {
  switch (event.type) {
    case "start":
      return state.phase === "idle" ? enterLine(event.lineIdx, ctx) : same(state);
    case "seek":
      return state.phase === "idle" ? same(state) : enterLine(event.lineIdx, ctx);
    case "timer":
      if (state.phase === "preview") {
        return { state: { phase: "listen", lineIdx: state.lineIdx }, effects: [{ type: "play" }] };
      }
      if (state.phase === "reveal") {
        const next = ctx.loop ? state.lineIdx : state.lineIdx + 1;
        // Past the last line: stay paused on the revealed line.
        if (next >= ctx.lines.length) return { state: { ...PRIMED_IDLE, lineIdx: state.lineIdx }, effects: [] };
        return enterLine(next, ctx);
      }
      return same(state);
    case "tick": {
      if (state.phase !== "listen") return same(state);
      const line = ctx.lines[state.lineIdx];
      if (!line || event.ms < line.tEndMs) return same(state);
      return {
        state: { phase: "reveal", lineIdx: state.lineIdx },
        effects: [{ type: "pause" }, { type: "timer", ms: PRIMED_REVEAL_MS }],
      };
    }
    case "userPause":
      if (state.phase === "idle") return same(state);
      return {
        state: { phase: "idle", lineIdx: state.lineIdx },
        // Preview/reveal already hold the video paused.
        effects: state.phase === "listen" ? [{ type: "pause" }] : [],
      };
    case "exit":
      if (state.phase === "idle") return same(state);
      return {
        state: { phase: "idle", lineIdx: state.lineIdx },
        // We were holding the video paused: hand playback back to the user.
        effects: state.phase === "listen" ? [] : [{ type: "play" }],
      };
  }
}

/** The video reads as "playing" while the machine is mid-cycle, even when paused by it. */
export function primedIsActive(state: PrimedState): boolean {
  return state.phase !== "idle";
}

/**
 * What the focal subtitle shows. The user's toggles are a ceiling: hiding JP
 * or the translation stays hidden in every phase; the primed phase can only
 * hide more.
 */
export function subtitleVisibility(
  phase: PrimedPhase,
  toggles: { japanese: boolean; translation: boolean },
): { japanese: boolean; translation: boolean } {
  switch (phase) {
    case "preview":
      return { japanese: false, translation: toggles.translation };
    case "listen":
      return { japanese: false, translation: false };
    case "reveal":
    case "idle":
      return { japanese: toggles.japanese, translation: toggles.translation };
  }
}

/** Line under `ms`, else the next line starting after it; -1 past the end. */
export function lineAtOrAfter(lines: readonly PrimedLine[], ms: number): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (ms < l.tEndMs) return i;
  }
  return -1;
}

// ---- Per-browser preferences ----

export const FURIGANA_MODES = ["off", "all", "unknown"] as const;
/** off · all words · unknown words only (hidden for words the user knows). */
export type FuriganaMode = (typeof FURIGANA_MODES)[number];

export interface PlayerPrefs {
  listeningMode: ListeningMode;
  showJapanese: boolean;
  /** Color tokens by known-word status. */
  colorKnown: boolean;
  furigana: FuriganaMode;
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  listeningMode: "normal",
  showJapanese: true,
  colorKnown: true,
  furigana: "off",
};

export const PLAYER_PREFS_KEY = "fuchine.player.prefs.v1";

/** Parse stored prefs; anything missing or malformed falls back to the default. */
export function parsePlayerPrefs(raw: string | null | undefined): PlayerPrefs {
  if (!raw) return DEFAULT_PLAYER_PREFS;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return DEFAULT_PLAYER_PREFS;
  }
  if (!v || typeof v !== "object") return DEFAULT_PLAYER_PREFS;
  const o = v as Record<string, unknown>;
  const d = DEFAULT_PLAYER_PREFS;
  return {
    listeningMode: (LISTENING_MODES as readonly unknown[]).includes(o.listeningMode)
      ? (o.listeningMode as ListeningMode)
      : d.listeningMode,
    showJapanese: typeof o.showJapanese === "boolean" ? o.showJapanese : d.showJapanese,
    colorKnown: typeof o.colorKnown === "boolean" ? o.colorKnown : d.colorKnown,
    furigana: (FURIGANA_MODES as readonly unknown[]).includes(o.furigana)
      ? (o.furigana as FuriganaMode)
      : d.furigana,
  };
}

/** Storage can be absent or throw (private mode, blocked site data): degrade to defaults. */
export function loadPlayerPrefs(storage: Pick<Storage, "getItem"> | undefined): PlayerPrefs {
  try {
    return parsePlayerPrefs(storage?.getItem(PLAYER_PREFS_KEY));
  } catch {
    return DEFAULT_PLAYER_PREFS;
  }
}

export function savePlayerPrefs(storage: Pick<Storage, "setItem"> | undefined, prefs: PlayerPrefs): void {
  try {
    storage?.setItem(PLAYER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* per-browser convenience only */
  }
}

export function nextInCycle<T>(values: readonly T[], current: T): T {
  const i = values.indexOf(current);
  return values[(i + 1) % values.length]!;
}

// ---- Known-word signals ----

/**
 * Per-word knowledge status for the current user. Computed server-side (one
 * function in apps/web, swappable for the T3.9 confidence model); the player
 * only renders it. Words absent from the map are "unknown".
 */
export type WordStatus = "unknown" | "seen" | "known";

export function statusOf(
  statuses: Readonly<Record<string, WordStatus>> | undefined,
  wordEntryId: string | null | undefined,
): WordStatus {
  if (!wordEntryId || !statuses) return "unknown";
  return statuses[wordEntryId] ?? "unknown";
}

/** Furigana for one token under the furigana mode. */
export function showReadingFor(mode: FuriganaMode, status: WordStatus): boolean {
  if (mode === "off") return false;
  if (mode === "all") return true;
  return status !== "known";
}
