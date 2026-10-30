// Shared, self-contained capture helpers used by the popup and the background
// service worker. Both pass these functions by reference to
// browser.scripting.executeScript({ world: "MAIN", func }), which serializes the
// function source into the YouTube page — so each function MUST be
// self-contained: no imports, no module-scope helpers, no outer references.
// capture.test.ts re-evaluates them from their source text to enforce this.

/** One caption line as sent to POST /api/import. */
export interface CaptionLine {
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** The /api/import payload (plus `source`, which the server ignores). */
export interface CapturedVideo {
  url: string;
  title?: string;
  channel?: string;
  durationS: number | null;
  language: "ja";
  captions: CaptionLine[];
  source: string;
}

export interface CaptureError {
  error: string;
  langs?: string[];
  tried?: unknown[];
  captured?: number;
}

export type CaptureResult = CapturedVideo | CaptureError;

/**
 * Reads the current video from the player API (window.ytInitialPlayerResponse
 * as fallback) and the timedtext tracks inject.content.ts stashed on
 * window.__fuchine. Returns `{ ...meta, captions, source }` or `{ error }`.
 */
export async function extractCaptions(): Promise<CaptureResult> {
  const decode = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

  type Line = { startMs: number; endMs: number; text: string };

  function parse(body: string): Line[] {
    if (body.trimStart().startsWith("{")) {
      let d: any;
      try { d = JSON.parse(body); } catch { return []; }
      return (d.events || [])
        .filter((e: any) => Array.isArray(e.segs))
        .map((e: any) => ({
          startMs: e.tStartMs || 0,
          endMs: (e.tStartMs || 0) + (e.dDurationMs || 0),
          text: e.segs.map((s: any) => s.utf8 || "").join("").trim(),
        }));
    }
    if (body.includes("<text")) {
      return [...body.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)].map((m) => {
        const st = Math.round(parseFloat(m[1]!) * 1000);
        const du = m[2] ? Math.round(parseFloat(m[2]) * 1000) : 0;
        return { startMs: st, endMs: st + du, text: decode(m[3]!).trim() };
      });
    }
    return [];
  }

  const finalize = (caps: Line[]) =>
    caps.filter((c) => c.text.length > 0).map((c, i) => ({ idx: i, ...c }));

  try {
    // YouTube is a single-page app: window.ytInitialPlayerResponse is captured
    // from the initial document load and is NOT refreshed on in-app navigation
    // between videos. Reading metadata from it imports the *first* video's
    // title/channel/duration/captions for every later video (only the URL,
    // read live below, changes). Read the current video from the player API,
    // which updates on navigation, and fall back to the (possibly stale)
    // initial response only when the player isn't available.
    const w = window as any;
    const pr = w.ytInitialPlayerResponse;
    const vd = pr?.videoDetails || {};
    const player = document.getElementById("movie_player") as any;
    const live = (player && player.getVideoData && player.getVideoData()) || {};
    const videoId: string | null = live.video_id || vd.videoId || null;
    const meta = {
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : location.href.split("&")[0]!,
      title: live.title || vd.title,
      channel: live.author || vd.author,
      durationS:
        (player && player.getDuration && Math.round(player.getDuration())) ||
        Number(vd.lengthSeconds) ||
        null,
      language: "ja" as const,
    };
    const captured: { url: string; body: string }[] = (w.__fuchine && w.__fuchine.tracks) || [];

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
    const tracks: any[] = prMatches
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
    const tried: unknown[] = [];
    for (const [fmt, url] of variants) {
      let body = "";
      try {
        const r = await fetch(url, { credentials: "include" });
        body = await r.text();
        tried.push({ fmt, status: r.status, bytes: body.length });
      } catch (e: any) {
        tried.push({ fmt, err: String(e && e.message ? e.message : e) });
        continue;
      }
      if (body.trim()) {
        const caps = finalize(parse(body));
        if (caps.length) return { ...meta, captions: caps, source: `baseUrl:${fmt}` };
      }
    }
    return { error: "needs-cc", tried, captured: captured.length };
  } catch (err: any) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Best-effort: get the player playing with the Japanese caption track on, so it
 * fetches the timedtext (inject.content.ts then captures it). Returns readiness
 * info so the caller can poll until the player has actually initialized — "tab
 * loaded" is not the same as "player ready". Fragile by nature.
 */
export function primeCapture(): { ready: boolean; state?: number; error?: string } {
  try {
    const p = document.getElementById("movie_player") as any;
    if (!p || !p.getPlayerState) return { ready: false };
    // Muted playback is allowed to autoplay; the player needs to be playing to
    // fetch the caption track.
    if (p.mute) p.mute();
    if (p.playVideo) p.playVideo();
    if (p.setOption) {
      p.setOption("captions", "track", { languageCode: "ja" });
      p.setOption("captions", "reload", true);
    } else if (p.loadModule) {
      p.loadModule("captions");
    }
    return { ready: true, state: p.getPlayerState() };
  } catch (e: any) {
    return { ready: false, error: String((e && e.message) || e) };
  }
}
