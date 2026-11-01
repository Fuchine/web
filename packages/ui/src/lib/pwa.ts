// PWA helpers (T3.13): platform detection for the install affordance and a
// framework-free Screen Wake Lock controller. Pure / injectable so they test
// in node without a DOM.

// ---- install affordance ----------------------------------------------------

/** The Chromium `beforeinstallprompt` event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export interface PlatformInfo {
  userAgent: string;
  /** navigator.maxTouchPoints — iPadOS reports a Mac UA but has touch. */
  maxTouchPoints?: number;
}

/**
 * iOS / iPadOS, where there is no install prompt and "Add to Home Screen" from
 * the Share sheet is the only way in.
 */
export function isIos({ userAgent, maxTouchPoints = 0 }: PlatformInfo): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ requests the desktop site: "Macintosh" UA + a touch screen.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Already running as an installed app (no point offering to install). */
export function isStandalone(
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
  navigatorStandalone?: boolean,
): boolean {
  if (navigatorStandalone === true) return true; // iOS Safari
  try {
    return !!matchMedia?.("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

export const IOS_INSTALL_HINT_KEY = "fuchine.iosInstallHintDismissed";

/** Whether the learner dismissed the iOS "Add to Home Screen" hint. Storage failures read as "not dismissed". */
export function readIosHintDismissed(storage?: Pick<Storage, "getItem"> | null): boolean {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    return s?.getItem(IOS_INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember the dismissal for this browser. Best-effort. */
export function storeIosHintDismissed(storage?: Pick<Storage, "setItem"> | null): void {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    s?.setItem(IOS_INSTALL_HINT_KEY, "1");
  } catch {
    // per-browser convenience only
  }
}

// ---- screen wake lock --------------------------------------------------------

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

export interface WakeLockEnv {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  /** document.visibilityState getter. */
  visibilityState: () => DocumentVisibilityState;
  addVisibilityListener: (fn: () => void) => void;
  removeVisibilityListener: (fn: () => void) => void;
}

export interface WakeLockController {
  /** Keep the screen on (re-acquired whenever the page becomes visible again). */
  start: () => void;
  /** Let the screen sleep again and stop listening. */
  stop: () => void;
  /** Whether a lock is currently held (for tests / debugging). */
  held: () => boolean;
}

/**
 * Keeps the screen awake during a review session. The browser drops the lock
 * by itself when the tab is hidden, so it is re-requested on `visibilitychange`
 * back to visible. Unsupported browsers (or a refused request — battery saver,
 * no user activation) silently do nothing: the session works the same.
 */
export function createWakeLockController(env: WakeLockEnv): WakeLockController {
  let sentinel: WakeLockSentinelLike | null = null;
  let active = false;
  let pending = false;

  async function acquire() {
    if (!active || !env.wakeLock || pending) return;
    if (sentinel && !sentinel.released) return;
    if (env.visibilityState() !== "visible") return;
    pending = true;
    try {
      const s = await env.wakeLock.request("screen");
      if (active) sentinel = s;
      else await s.release().catch(() => {}); // stopped while the request was in flight
    } catch {
      sentinel = null;
    } finally {
      pending = false;
    }
  }

  function onVisibility() {
    if (env.visibilityState() === "visible") void acquire();
  }

  return {
    start() {
      if (active) return;
      active = true;
      env.addVisibilityListener(onVisibility);
      void acquire();
    },
    stop() {
      if (!active) return;
      active = false;
      env.removeVisibilityListener(onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) void s.release().catch(() => {});
    },
    held: () => !!sentinel && !sentinel.released,
  };
}

/** The real browser environment, or null outside a browser. */
export function browserWakeLockEnv(): WakeLockEnv | null {
  if (typeof document === "undefined" || typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockEnv["wakeLock"] };
  return {
    wakeLock: nav.wakeLock,
    visibilityState: () => document.visibilityState,
    addVisibilityListener: (fn) => document.addEventListener("visibilitychange", fn),
    removeVisibilityListener: (fn) => document.removeEventListener("visibilitychange", fn),
  };
}
