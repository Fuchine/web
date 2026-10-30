import { describe, expect, it, vi } from "vitest";
import {
  createWakeLockController,
  isIos,
  isStandalone,
  readIosHintDismissed,
  storeIosHintDismissed,
  IOS_INSTALL_HINT_KEY,
  type WakeLockEnv,
} from "./pwa";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("isIos", () => {
  it("detects iPhone and iPadOS (desktop UA + touch)", () => {
    expect(isIos({ userAgent: IPHONE })).toBe(true);
    expect(isIos({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
  });
  it("rejects a real Mac and Android", () => {
    expect(isIos({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe("isStandalone", () => {
  it("reads display-mode or the iOS navigator.standalone flag", () => {
    expect(isStandalone(() => ({ matches: true }))).toBe(true);
    expect(isStandalone(() => ({ matches: false }), true)).toBe(true);
    expect(isStandalone(() => ({ matches: false }))).toBe(false);
    expect(isStandalone(undefined)).toBe(false);
    expect(isStandalone(() => { throw new Error("no"); })).toBe(false);
  });
});

describe("iOS hint dismissal storage", () => {
  it("round-trips and tolerates broken storage", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(readIosHintDismissed(storage)).toBe(false);
    storeIosHintDismissed(storage);
    expect(map.get(IOS_INSTALL_HINT_KEY)).toBe("1");
    expect(readIosHintDismissed(storage)).toBe(true);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readIosHintDismissed(throwing)).toBe(false);
    expect(() => storeIosHintDismissed(throwing)).not.toThrow();
    expect(readIosHintDismissed(null)).toBe(false);
  });
});

function fakeEnv(opts: { supported?: boolean; refuse?: boolean } = {}) {
  let visibility: DocumentVisibilityState = "visible";
  const listeners = new Set<() => void>();
  const sentinels: { released: boolean; release: () => Promise<void> }[] = [];
  const request = vi.fn(async () => {
    if (opts.refuse) throw new Error("NotAllowedError");
    const s = { released: false, release: vi.fn(async () => { s.released = true; }) };
    sentinels.push(s);
    return s;
  });
  const env: WakeLockEnv = {
    wakeLock: opts.supported === false ? undefined : { request },
    visibilityState: () => visibility,
    addVisibilityListener: (fn) => listeners.add(fn),
    removeVisibilityListener: (fn) => listeners.delete(fn),
  };
  return {
    env,
    request,
    sentinels,
    listeners,
    setVisibility(v: DocumentVisibilityState) {
      visibility = v;
      // The browser auto-releases the lock when the page is hidden.
      if (v === "hidden") for (const s of sentinels) s.released = true;
      for (const fn of listeners) fn();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createWakeLockController", () => {
  it("holds the lock while started and releases it on stop", async () => {
    const f = fakeEnv();
    const c = createWakeLockController(f.env);
    c.start();
    await flush();
    expect(f.request).toHaveBeenCalledWith("screen");
    expect(c.held()).toBe(true);
    c.stop();
    expect(c.held()).toBe(false);
    expect(f.sentinels[0]!.release).toHaveBeenCalled();
    expect(f.listeners.size).toBe(0);
  });

  it("re-acquires after the page comes back from hidden", async () => {
    const f = fakeEnv();
    const c = createWakeLockController(f.env);
    c.start();
    await flush();
    f.setVisibility("hidden");
    expect(c.held()).toBe(false);
    f.setVisibility("visible");
    await flush();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(c.held()).toBe(true);
    c.stop();
  });

  it("is a no-op when unsupported or refused", async () => {
    const unsupported = createWakeLockController(fakeEnv({ supported: false }).env);
    unsupported.start();
    await flush();
    expect(unsupported.held()).toBe(false);
    unsupported.stop();

    const f = fakeEnv({ refuse: true });
    const refused = createWakeLockController(f.env);
    refused.start();
    await flush();
    expect(refused.held()).toBe(false);
    refused.stop();
  });

  it("releases a lock granted after stop()", async () => {
    const f = fakeEnv();
    const c = createWakeLockController(f.env);
    c.start();
    c.stop(); // before the request resolves
    await flush();
    expect(c.held()).toBe(false);
    expect(f.sentinels[0]!.released).toBe(true);
  });
});
