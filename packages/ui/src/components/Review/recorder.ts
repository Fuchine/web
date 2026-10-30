// Shadowing recorder — pure helpers (T3.11). The recording lives only in memory
// (a Blob behind an object URL in this tab): never uploaded, never persisted.

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "ready"
  | "denied"
  | "no-device"
  | "unsupported"
  | "error";

/** Hard cap on a take, so a forgotten recording can't grow without bound. */
export const MAX_TAKE_MS = 30_000;

export interface RecorderEnv {
  mediaDevices?: { getUserMedia?: unknown } | null;
  MediaRecorder?: unknown;
  isSecureContext?: boolean;
}

/** Can this browser record at all? (getUserMedia + MediaRecorder, secure context.) */
export function recorderSupported(env: RecorderEnv): boolean {
  if (env.isSecureContext === false) return false;
  return typeof env.mediaDevices?.getUserMedia === "function" && typeof env.MediaRecorder === "function";
}

export function browserRecorderEnv(): RecorderEnv {
  if (typeof window === "undefined") return {};
  return {
    mediaDevices: typeof navigator !== "undefined" ? navigator.mediaDevices : undefined,
    MediaRecorder: (window as unknown as { MediaRecorder?: unknown }).MediaRecorder,
    isSecureContext: window.isSecureContext,
  };
}

const MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** First container the recorder supports; undefined → let the browser choose. */
export function pickRecorderMime(isTypeSupported: ((type: string) => boolean) | undefined): string | undefined {
  if (!isTypeSupported) return undefined;
  for (const type of MIME_PREFERENCE) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

/** Map a getUserMedia / MediaRecorder failure to a status the UI can explain. */
export function classifyMicError(err: unknown): Extract<RecorderStatus, "denied" | "no-device" | "error"> {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no-device";
  return "error";
}

export function recorderMessage(status: RecorderStatus): string | null {
  switch (status) {
    case "denied":
      return "Microphone access was blocked. Allow it in your browser's site settings to record — you can still loop the clip and shadow along.";
    case "no-device":
      return "No microphone was found. Connect one to record — you can still loop the clip and shadow along.";
    case "unsupported":
      return "This browser can't record audio here. You can still loop the clip and shadow along.";
    case "error":
      return "Recording failed. Try again, or keep shadowing along with the clip.";
    default:
      return null;
  }
}

export function formatTakeTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `0:${String(Math.min(s, 59)).padStart(2, "0")}`;
}
