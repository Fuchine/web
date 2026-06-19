// Service worker: on an IMPORT request from bridge.js, open a YouTube tab,
// enable CC, capture captions via the page's MAIN world, POST them to the
// originating Fuchine instance, then report the result back and close the tab.
importScripts("capture.js"); // defines extractCaptions, enableCaptions

const CAPTURE_WAIT_MS = 2500;

function waitForComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
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

async function doImport(videoId, base) {
  const tab = await chrome.tabs.create({
    url: `https://www.youtube.com/watch?v=${videoId}`,
  });
  try {
    await waitForComplete(tab.id);
    await runInPage(tab.id, enableCaptions);
    await sleep(CAPTURE_WAIT_MS);
    const cap = await runInPage(tab.id, extractCaptions);

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
    return { ok: true, lines: body.lines };
  } finally {
    if (tab.id != null) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "IMPORT" || typeof msg.videoId !== "string") return;
  const appTabId = sender.tab && sender.tab.id;
  const base = sender.url ? new URL(sender.url).origin : "http://localhost:3000";
  if (appTabId == null) return;

  doImport(msg.videoId, base)
    .catch((err) => ({ ok: false, error: String((err && err.message) || err) }))
    .then((result) => {
      chrome.tabs.sendMessage(appTabId, {
        type: "IMPORT_RESULT",
        videoId: msg.videoId,
        ...result,
      });
    });
  // No async response needed on this channel; result is delivered via sendMessage.
});
