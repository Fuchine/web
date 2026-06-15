// Popup logic: read captions from the active YouTube tab (in the page's MAIN
// world, where the user's session lets the caption track download succeed) and
// POST them to the Fuchine import API.

const DEFAULT_BASE = "http://localhost:3000";

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $("status").textContent = msg; };

async function getBase() {
  const { base } = await chrome.storage.local.get("base");
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Runs in the page (MAIN world). Reads the player response, picks the Japanese
 * caption track, downloads it with the page's credentials, and returns the
 * caption lines plus video metadata.
 */
async function extractCaptions() {
  try {
    const pr = window.ytInitialPlayerResponse;
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const ja =
      tracks.find((t) => (t.languageCode || "").startsWith("ja") && t.kind !== "asr") ||
      tracks.find((t) => (t.languageCode || "").startsWith("ja"));
    if (!ja) return { error: "no-ja", langs: tracks.map((t) => t.languageCode) };

    const res = await fetch(ja.baseUrl + "&fmt=json3", { credentials: "include" });
    const data = await res.json();
    const captions = (data.events || [])
      .filter((e) => Array.isArray(e.segs))
      .map((e, i) => ({
        idx: i,
        startMs: e.tStartMs || 0,
        endMs: (e.tStartMs || 0) + (e.dDurationMs || 0),
        text: e.segs.map((s) => s.utf8 || "").join("").trim(),
      }))
      .filter((c) => c.text.length > 0);

    const vd = pr?.videoDetails || {};
    return {
      url: location.href.split("&")[0],
      title: vd.title,
      channel: vd.author,
      durationS: Number(vd.lengthSeconds) || null,
      language: "ja",
      captions,
    };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
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

    if (!result || result.error === "no-ja") {
      setStatus(`No Japanese captions on this video.${result?.langs?.length ? ` (has: ${result.langs.join(", ")})` : ""}`);
      return;
    }
    if (result.error) { setStatus(`Could not read captions: ${result.error}`); return; }
    if (!result.captions || result.captions.length === 0) {
      setStatus("Japanese track found but no lines were returned.");
      return;
    }

    setStatus(`Importing ${result.captions.length} lines…`);
    const base = await getBase();
    const res = await fetch(`${base}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(result),
    });

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
