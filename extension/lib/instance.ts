// Pure helpers shared by the popup and the background service worker.

/** Instance used when the user hasn't configured one (local dev). */
export const DEFAULT_BASE = "http://localhost:3000";

/** Id of the dynamically registered bridge content script. */
export const BRIDGE_SCRIPT_ID = "bridge-dynamic";

/** Path of the built bridge content script (WXT output for entrypoints/bridge.content.ts). */
export const BRIDGE_SCRIPT_FILE = "content-scripts/bridge.js";

/**
 * "Known issues" page linked from the popup. Override at build time with
 * WXT_STATUS_URL (e.g. a page on the maintainer's site).
 */
export const STATUS_URL: string =
  import.meta.env.WXT_STATUS_URL ||
  "https://github.com/Fuchine/web/blob/main/docs/EXTENSION_STATUS.md";

/** Normalize a user-typed instance URL (trailing slashes off), defaulting to dev. */
export function normalizeBase(base: string | undefined | null): string {
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

/** `https://host/*` match pattern for an instance base URL, or null if unparseable. */
export function originPattern(base: string): string | null {
  try {
    return new URL(base).origin + "/*";
  } catch {
    return null;
  }
}

/** True for the dev origin that the static manifest already covers. */
export function isStaticBridgeOrigin(origin: string): boolean {
  return /^https?:\/\/localhost:3000$/.test(origin);
}

/** Match pattern used to register the bridge for an instance origin. */
export function bridgeMatchPattern(origin: string): string {
  return origin.replace(/\/+$/, "") + "/*";
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Only a bare 11-char YouTube id is accepted, so a crafted message can't inject
 * extra query params into the watch URL.
 */
export function isVideoId(v: unknown): v is string {
  return typeof v === "string" && VIDEO_ID_RE.test(v);
}
