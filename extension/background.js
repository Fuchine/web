// Service worker: on an IMPORT request from bridge.js, open a YouTube tab,
// enable CC, capture captions via the page's MAIN world, POST them to the
// originating Fuchine instance, then report the result back and close the tab.
importScripts("capture.js"); // defines extractCaptions, primeCapture

const LOAD_TIMEOUT_MS = 30000;

function waitForComplete(tabId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(fn, arg) {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      fn(arg);
    }
    function listener(id, info) {
      if (id === tabId && info.status === "complete") finish(resolve);
    }
    const timer = setTimeout(
      () => finish(reject, new Error("YouTube tab took too long to load")),
      LOAD_TIMEOUT_MS,
    );
    chrome.tabs.onUpdated.addListener(listener);
    // Guard the race: the tab may already be "complete" before the listener was added.
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab && tab.status === "complete") finish(resolve);
      })
      .catch(() => {});
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runInPage(tabId, func) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
  });
  return result;
}

// Poll: the YouTube player isn't ready the moment the tab finishes loading, and
// it only fetches the caption track once it's playing with CC on. Re-prime and
// re-extract on a loop until captions are captured (or we give up).
const POLL_INTERVAL_MS = 1000;
const POLL_ATTEMPTS = 15;

async function captureWithRetry(tabId) {
  let last = null;
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const primed = await runInPage(tabId, primeCapture);
    const cap = await runInPage(tabId, extractCaptions);
    last = cap;
    console.log(`[fuchine] attempt ${i + 1}/${POLL_ATTEMPTS}`, {
      ready: primed && primed.ready,
      state: primed && primed.state,
      error: cap && cap.error,
      lines: cap && cap.captions ? cap.captions.length : 0,
    });
    if (cap && cap.captions && cap.captions.length > 0) return cap;
    // "no-ja" is terminal: the video simply has no Japanese track.
    if (cap && cap.error === "no-ja") return cap;
    await sleep(POLL_INTERVAL_MS);
  }
  return last;
}

async function doImport(videoId, base) {
  const tab = await chrome.tabs.create({
    url: `https://www.youtube.com/watch?v=${videoId}`,
  });
  try {
    await waitForComplete(tab.id);
    const cap = await captureWithRetry(tab.id);

    if (!cap) return { ok: false, error: "Could not read the page." };
    if (cap.error === "no-ja") return { ok: false, error: "No Japanese subtitles on this video." };
    if (cap.error === "needs-cc") return { ok: false, error: "Couldn't capture subtitles — try opening on YouTube." };
    if (cap.error) return { ok: false, error: `Capture failed: ${cap.error}` };
    if (!cap.captions || cap.captions.length === 0) return { ok: false, error: "No subtitle lines found." };

    const res = await fetch(`${base}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(cap),
    });
    if (res.status === 401) return { ok: false, error: "Sign in to Fuchine first, then retry." };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Import failed (${res.status}): ${body.error || ""}` };
    // body.videoId is the internal DB id (UUID) — the player route keys on it,
    // not the YouTube id.
    return { ok: true, lines: body.lines, dbVideoId: body.videoId };
  } finally {
    if (tab.id != null) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "IMPORT" || typeof msg.videoId !== "string") return;
  // Reject anything that isn't a bare 11-char YouTube id, so a crafted message
  // can't inject extra query params into the watch URL.
  if (!VIDEO_ID_RE.test(msg.videoId)) return;
  const appTabId = sender.tab && sender.tab.id;
  const base = sender.url ? new URL(sender.url).origin : "http://localhost:3000";
  if (appTabId == null) return;

  doImport(msg.videoId, base)
    .catch((err) => ({ ok: false, error: String((err && err.message) || err) }))
    .then((result) => {
      // Swallow "no receiving end" if the app tab was closed mid-import.
      chrome.tabs
        .sendMessage(appTabId, {
          type: "IMPORT_RESULT",
          videoId: msg.videoId,
          ...result,
        })
        .catch(() => {});
    });
  // No async response needed on this channel; result is delivered via sendMessage.
});
