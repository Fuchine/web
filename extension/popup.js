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

/** Runs in the page (MAIN world). Returns caption lines + metadata, or a reason. */
async function extractCaptions() {
  const decode = (s) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

  function parse(body) {
    if (body.trimStart().startsWith("{")) {
      let d;
      try { d = JSON.parse(body); } catch { return []; }
      return (d.events || [])
        .filter((e) => Array.isArray(e.segs))
        .map((e) => ({
          startMs: e.tStartMs || 0,
          endMs: (e.tStartMs || 0) + (e.dDurationMs || 0),
          text: e.segs.map((s) => s.utf8 || "").join("").trim(),
        }));
    }
    if (body.includes("<text")) {
      return [...body.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)].map((m) => {
        const st = Math.round(parseFloat(m[1]) * 1000);
        const du = m[2] ? Math.round(parseFloat(m[2]) * 1000) : 0;
        return { startMs: st, endMs: st + du, text: decode(m[3]).trim() };
      });
    }
    return [];
  }

  const finalize = (caps) => caps.filter((c) => c.text.length > 0).map((c, i) => ({ idx: i, ...c }));

  try {
    const pr = window.ytInitialPlayerResponse;
    const vd = pr?.videoDetails || {};
    const meta = {
      url: location.href.split("&")[0],
      title: vd.title,
      channel: vd.author,
      durationS: Number(vd.lengthSeconds) || null,
      language: "ja",
    };
    const captured = (window.__fuchine && window.__fuchine.tracks) || [];

    // 1) Intercepted player request (preferred).
    let ja = captured.filter((t) => /[?&](?:lang|tlang)=ja/.test(t.url));
    if (vd.videoId && ja.some((t) => t.url.includes(vd.videoId))) {
      ja = ja.filter((t) => t.url.includes(vd.videoId));
    }
    const best = ja.filter((t) => !/[?&]kind=asr/.test(t.url)).pop() || ja.pop();
    if (best) {
      const caps = finalize(parse(best.body));
      if (caps.length) return { ...meta, captions: caps, source: "intercepted" };
    }

    // 2) Re-fetch the baseUrl (often gated).
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const track =
      tracks.find((t) => (t.languageCode || "").startsWith("ja") && t.kind !== "asr") ||
      tracks.find((t) => (t.languageCode || "").startsWith("ja"));
    if (!track) {
      return { error: "no-ja", langs: tracks.map((t) => t.languageCode), captured: captured.length };
    }
    const sep = track.baseUrl.includes("?") ? "&" : "?";
    const variants = [["default", track.baseUrl], ["json3", `${track.baseUrl}${sep}fmt=json3`]];
    const tried = [];
    for (const [fmt, url] of variants) {
      let body = "";
      try {
        const r = await fetch(url, { credentials: "include" });
        body = await r.text();
        tried.push({ fmt, status: r.status, bytes: body.length });
      } catch (e) {
        tried.push({ fmt, err: String(e && e.message ? e.message : e) });
        continue;
      }
      if (body.trim()) {
        const caps = finalize(parse(body));
        if (caps.length) return { ...meta, captions: caps, source: `baseUrl:${fmt}` };
      }
    }
    return { error: "needs-cc", tried, captured: captured.length };
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
