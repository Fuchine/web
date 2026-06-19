// Shared, self-contained capture helpers. Loaded by popup.html (script tag) and
// by background.js (importScripts). Both pass these by reference to
// chrome.scripting.executeScript, which serializes the function into the page —
// so each function MUST be self-contained (no outer-scope references).

// extractCaptions moved verbatim from popup.js — reads window.ytInitialPlayerResponse,
// window.__fuchine, and the player API; returns { ...meta, captions } or { error }.
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
    // YouTube is a single-page app: window.ytInitialPlayerResponse is captured
    // from the initial document load and is NOT refreshed on in-app navigation
    // between videos. Reading metadata from it imports the *first* video's
    // title/channel/duration/captions for every later video (only the URL,
    // read live below, changes). Read the current video from the player API,
    // which updates on navigation, and fall back to the (possibly stale)
    // initial response only when the player isn't available.
    const pr = window.ytInitialPlayerResponse;
    const vd = pr?.videoDetails || {};
    const player = document.getElementById("movie_player");
    const live = (player && player.getVideoData && player.getVideoData()) || {};
    const videoId = live.video_id || vd.videoId || null;
    const meta = {
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : location.href.split("&")[0],
      title: live.title || vd.title,
      channel: live.author || vd.author,
      durationS:
        (player && player.getDuration && Math.round(player.getDuration())) ||
        Number(vd.lengthSeconds) ||
        null,
      language: "ja",
    };
    const captured = (window.__fuchine && window.__fuchine.tracks) || [];

    // 1) Intercepted player request (preferred). __fuchine.tracks accumulates
    //    across every video watched in the tab, so match the current video id
    //    strictly — never fall back to another video's captured track.
    let ja = captured.filter((t) => /[?&](?:lang|tlang)=ja/.test(t.url));
    if (videoId) ja = ja.filter((t) => t.url.includes(videoId));
    const best = ja.filter((t) => !/[?&]kind=asr/.test(t.url)).pop() || ja.pop();
    if (best) {
      const caps = finalize(parse(best.body));
      if (caps.length) return { ...meta, captions: caps, source: "intercepted" };
    }

    // 2) Re-fetch the baseUrl (often gated). Only trust the initial player
    //    response's track list when it actually describes the current video —
    //    on SPA navigation it belongs to an earlier one.
    const prMatches = !videoId || !vd.videoId || vd.videoId === videoId;
    const tracks = prMatches
      ? pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
      : [];
    const track =
      tracks.find((t) => (t.languageCode || "").startsWith("ja") && t.kind !== "asr") ||
      tracks.find((t) => (t.languageCode || "").startsWith("ja"));
    if (!track) {
      // Stale player response means the only captions we have are another
      // video's — tell the user to enable CC so the player fetches this one's.
      if (!prMatches) return { error: "needs-cc", tried: [], captured: captured.length };
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

// Best-effort: turn on the Japanese caption track so the player fetches it
// (inject.js then captures the timedtext response). Fragile by nature.
function enableCaptions() {
  try {
    const p = document.getElementById("movie_player");
    if (p && p.setOption) {
      p.setOption("captions", "track", { languageCode: "ja" });
      p.setOption("captions", "reload", true);
    } else if (p && p.loadModule) {
      p.loadModule("captions");
    }
  } catch (e) {}
  return true;
}
