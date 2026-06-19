// Popup logic. Captions are obtained from the YouTube tab in two ways:
//   1) Intercepted — inject.js captured the player's own timedtext response
//      (carries the PO token). This is the reliable path; needs CC to have been
//      turned on so the player fetched the track.
//   2) Re-fetch — read the track baseUrl from ytInitialPlayerResponse and fetch
//      it. Often gated (empty), kept as a fallback.
// The result is POSTed to the Fuchine import API with the session cookie.

const DEFAULT_BASE = "http://localhost:3000";

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $("status").textContent = msg; };

async function getBase() {
  const { base } = await chrome.storage.local.get("base");
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

async function doImport() {
  const btn = $("import");
  btn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/youtube\.com\/watch/.test(tab.url || "")) {
      setStatus("Open a YouTube video first.");
      return;
    }

    setStatus("Reading captions…");
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: extractCaptions,
    });

    if (!result) { setStatus("No result from the page."); return; }
    if (result.error === "no-ja") {
      setStatus(`No Japanese captions on this video.${result.langs?.length ? ` (has: ${result.langs.join(", ")})` : ""}`);
      return;
    }
    if (result.error === "needs-cc") {
      setStatus("Turn on Japanese subtitles (CC) in the player, let it play ~2s, then click Import again.");
      return;
    }
    if (result.error) { setStatus(`Could not read captions: ${result.error}`); return; }
    if (!result.captions || result.captions.length === 0) {
      setStatus("Caption track found but no lines were returned.");
      return;
    }

    const base = await getBase();
    setStatus(`Captured ${result.captions.length} lines (${result.source}). Sending to ${base}…`);
    let res;
    try {
      res = await fetch(`${base}/api/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(result),
      });
    } catch (netErr) {
      setStatus(
        `Captured ${result.captions.length} lines (${result.source}) ✓\n` +
        `But couldn't reach Fuchine at ${base} — is the web app running there? ` +
        `(${netErr && netErr.message ? netErr.message : netErr})`,
      );
      return;
    }

    if (res.status === 401) {
      setStatus("Sign in to Fuchine first (open the web app), then retry.");
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(`Import failed (${res.status}): ${body.error || ""}`); return; }
    setStatus(body.cached ? "Already imported ✓ Open Fuchine to study." : `Added to Fuchine ✓ (${body.lines} lines)`);
  } catch (err) {
    setStatus(`Error: ${err && err.message ? err.message : err}`);
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("base").value = await getBase();
  $("base").addEventListener("change", (e) => {
    chrome.storage.local.set({ base: e.target.value.trim() });
  });
  $("import").addEventListener("click", doImport);
});
