"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  browserWakeLockEnv,
  createWakeLockController,
  isIos,
  isStandalone,
  readIosHintDismissed,
  storeIosHintDismissed,
  type BeforeInstallPromptEvent,
} from "../../lib/pwa";

/**
 * Keep the screen awake while `enabled` (T3.13): a phone should not dim in the
 * middle of a clip. Released on unmount / when disabled; re-acquired after the
 * tab comes back to the foreground. No-op where unsupported.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const env = browserWakeLockEnv();
    if (!env) return;
    const controller = createWakeLockController(env);
    controller.start();
    return () => controller.stop();
  }, [enabled]);
}

// ---- beforeinstallprompt ---------------------------------------------------
// Chromium may fire the event before React hydrates, so capture it at module
// load and keep it in a tiny external store.

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the mini-infobar away; we show our own button
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export interface InstallPromptState {
  /** Chromium offered an install prompt we can trigger. */
  canInstall: boolean;
  /** iOS without the app installed, hint not dismissed: show "Share → Add to Home Screen". */
  showIosHint: boolean;
  install: () => Promise<void>;
  dismissIosHint: () => void;
}

export function useInstallPrompt(): InstallPromptState {
  const promptEvent = useSyncExternalStore(subscribe, () => deferredPrompt, () => null);
  // Platform checks read browser globals: resolve after mount (SSR renders nothing).
  const [ios, setIos] = useState<{ eligible: boolean; dismissed: boolean }>({ eligible: false, dismissed: true });

  useEffect(() => {
    const standalone = isStandalone(
      window.matchMedia?.bind(window),
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
    setIos({
      eligible: !standalone && isIos({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
      dismissed: readIosHintDismissed(),
    });
  }, []);

  const install = useCallback(async () => {
    const e = deferredPrompt;
    if (!e) return;
    // The event is single-use either way.
    deferredPrompt = null;
    notify();
    try {
      await e.prompt();
      await e.userChoice;
    } catch {
      // prompt() throws if called twice or without a user gesture
    }
  }, []);

  const dismissIosHint = useCallback(() => {
    storeIosHintDismissed();
    setIos((s) => ({ ...s, dismissed: true }));
  }, []);

  return {
    canInstall: promptEvent !== null,
    showIosHint: ios.eligible && !ios.dismissed,
    install,
    dismissIosHint,
  };
}
