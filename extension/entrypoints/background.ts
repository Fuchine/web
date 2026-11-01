// Service worker: on an IMPORT request from the bridge, open a YouTube tab,
// enable CC, capture captions via the page's MAIN world, POST them to the
// originating Fuchine instance, then report the result back and close the tab.
import { extractCaptions, primeCapture, type CaptureResult } from "@/lib/capture";
import {
  BRIDGE_SCRIPT_FILE,
  BRIDGE_SCRIPT_ID,
  DEFAULT_BASE,
  bridgeMatchPattern,
  importRequestInit,
  isStaticBridgeOrigin,
  isVideoId,
  tokenForOrigin,
  unauthorizedMessage,
} from "@/lib/instance";

const LOAD_TIMEOUT_MS = 30000;
// Poll: the YouTube player isn't ready the moment the tab finishes loading, and
// it only fetches the caption track once it's playing with CC on. Re-prime and
// re-extract on a loop until captions are captured (or we give up).
const POLL_INTERVAL_MS = 1000;
const POLL_ATTEMPTS = 15;

type ImportOutcome = { ok: boolean; error?: string; lines?: number; dbVideoId?: string };

function waitForComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      browser.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      fn();
    }
    function listener(id: number, info: { status?: string }) {
      if (id === tabId && info.status === "complete") finish(resolve);
    }
    const timer = setTimeout(
      () => finish(() => reject(new Error("YouTube tab took too long to load"))),
      LOAD_TIMEOUT_MS,
    );
    browser.tabs.onUpdated.addListener(listener);
    // Guard the race: the tab may already be "complete" before the listener was added.
    browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab && tab.status === "complete") finish(resolve);
      })
      .catch(() => {});
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runInPage<T>(tabId: number, func: () => T | Promise<T>): Promise<T | undefined> {
  const [{ result } = {} as { result?: unknown }] = await browser.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
  });
  return result as T | undefined;
}

async function captureWithRetry(tabId: number): Promise<CaptureResult | undefined> {
  let last: CaptureResult | undefined;
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await runInPage(tabId, primeCapture); // play + enable JP CC so the track is fetched
    const cap = await runInPage(tabId, extractCaptions);
    last = cap;
    if (cap && "captions" in cap && cap.captions.length > 0) return cap;
    // "no-ja" is terminal: the video simply has no Japanese track.
    if (cap && "error" in cap && cap.error === "no-ja") return cap;
    await sleep(POLL_INTERVAL_MS);
  }
  return last;
}

async function doImport(videoId: string, base: string): Promise<ImportOutcome> {
  const tab = await browser.tabs.create({
    url: `https://www.youtube.com/watch?v=${videoId}`,
  });
  try {
    if (tab.id == null) return { ok: false, error: "Could not open the video tab." };
    await waitForComplete(tab.id);
    const cap = await captureWithRetry(tab.id);

    if (!cap) return { ok: false, error: "Could not read the page." };
    if ("error" in cap) {
      if (cap.error === "no-ja") return { ok: false, error: "No Japanese subtitles on this video." };
      if (cap.error === "needs-cc") return { ok: false, error: "Couldn't capture subtitles — try opening on YouTube." };
      return { ok: false, error: `Capture failed: ${cap.error}` };
    }
    if (!cap.captions || cap.captions.length === 0) return { ok: false, error: "No subtitle lines found." };

    // The API token (if any) is only sent to the instance it was configured
    // for; otherwise this falls back to the session cookie.
    const stored = (await browser.storage.local.get(["base", "apiToken"])) as {
      base?: string;
      apiToken?: string;
    };
    const token = tokenForOrigin(stored, base);
    const res = await fetch(`${base}/api/import`, importRequestInit(cap, token));
    if (res.status === 401) return { ok: false, error: unauthorizedMessage(token !== null) };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Import failed (${res.status}): ${body.error || ""}` };
    // body.videoId is the internal DB id (UUID) — the player route keys on it,
    // not the YouTube id.
    return { ok: true, lines: body.lines, dbVideoId: body.videoId };
  } finally {
    if (tab.id != null) browser.tabs.remove(tab.id).catch(() => {});
  }
}

// The bridge content script (app ↔ background relay) is in the static manifest
// only for localhost. For a published instance we register it at runtime, once
// the user has granted the host permission from the popup. Re-registered on
// startup so it survives service-worker restarts.
async function registerBridge(origin: string) {
  if (!origin || isStaticBridgeOrigin(origin)) return; // static covers dev
  const match = bridgeMatchPattern(origin);
  try {
    if (!(await browser.permissions.contains({ origins: [match] }))) return;
    await browser.scripting.unregisterContentScripts({ ids: [BRIDGE_SCRIPT_ID] }).catch(() => {});
    await browser.scripting.registerContentScripts([
      { id: BRIDGE_SCRIPT_ID, matches: [match], js: [BRIDGE_SCRIPT_FILE], runAt: "document_start" },
    ]);
  } catch (e) {
    // Best-effort: the popup POST path still works without the in-app bridge.
  }
}

async function reregisterBridgeFromStorage() {
  const { base } = (await browser.storage.local.get("base")) as { base?: string };
  if (!base) return;
  try {
    await registerBridge(new URL(base).origin);
  } catch (e) {}
}

export default defineBackground(() => {
  browser.runtime.onStartup.addListener(reregisterBridgeFromStorage);
  browser.runtime.onInstalled.addListener(reregisterBridgeFromStorage);

  browser.runtime.onMessage.addListener((msg: any) => {
    if (msg && msg.type === "REGISTER_BRIDGE" && typeof msg.origin === "string") {
      registerBridge(msg.origin);
    }
  });

  browser.runtime.onMessage.addListener((msg: any, sender) => {
    if (!msg || msg.type !== "IMPORT" || !isVideoId(msg.videoId)) return;
    const videoId: string = msg.videoId;
    const appTabId = sender.tab && sender.tab.id;
    const base = sender.url ? new URL(sender.url).origin : DEFAULT_BASE;
    if (appTabId == null) return;

    doImport(videoId, base)
      .catch((err): ImportOutcome => ({ ok: false, error: String((err && err.message) || err) }))
      .then((result) => {
        // Swallow "no receiving end" if the app tab was closed mid-import.
        browser.tabs
          .sendMessage(appTabId, {
            type: "IMPORT_RESULT",
            videoId,
            ...result,
          })
          .catch(() => {});
      });
    // No async response needed on this channel; result is delivered via sendMessage.
  });
});
