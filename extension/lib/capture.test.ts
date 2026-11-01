import { describe, expect, it, vi } from "vitest";
import { extractCaptions, primeCapture } from "./capture";

// executeScript serializes `func` and runs it in the page, so we do the same:
// rebuild each function from its source text with only page globals in scope.
// A reference to anything module-scoped would throw a ReferenceError here.
interface FakePage {
  window?: Record<string, unknown>;
  player?: Record<string, unknown> | null;
  href?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<{ status: number; text(): Promise<string> }>;
}

function inPage<T>(fn: (...args: never[]) => T, page: FakePage = {}): () => T {
  const win = page.window ?? {};
  const document = {
    getElementById: (id: string) => (id === "movie_player" ? page.player ?? null : null),
  };
  const location = { href: page.href ?? "https://www.youtube.com/watch?v=zzzzzzzzzzz&t=1" };
  const fetchImpl = page.fetch ?? (() => Promise.reject(new Error("no network in tests")));
  const factory = new Function(
    "window",
    "document",
    "location",
    "fetch",
    `"use strict"; return (${fn.toString()});`,
  );
  return factory(win, document, location, fetchImpl) as () => T;
}

const A = "aaaaaaaaaaa";
const B = "bbbbbbbbbbb";

const json3 = (events: unknown[]) => JSON.stringify({ wireMagic: "pb3", events });
const track = (videoId: string, body: string, extra = "") => ({
  url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ja${extra}&pot=x`,
  body,
  at: 0,
});
const playerFor = (videoId: string, extra: Record<string, unknown> = {}) => ({
  getVideoData: () => ({ video_id: videoId, title: `Title ${videoId}`, author: `Chan ${videoId}` }),
  getDuration: () => 123.6,
  ...extra,
});

describe("extractCaptions — parsing", () => {
  it("parses json3: joins segs, skips events without segs and empty lines, re-indexes", async () => {
    const body = json3([
      { tStartMs: 0, dDurationMs: 99999 }, // window/style event, no segs
      { tStartMs: 1000, dDurationMs: 1500, segs: [{ utf8: "こん" }, { utf8: "にちは" }] },
      { tStartMs: 2500, dDurationMs: 10, segs: [{ utf8: "\n" }] }, // whitespace only
      { tStartMs: 3000, segs: [{ utf8: " 元気？ " }, {}] }, // no duration, seg without utf8
    ]);
    const res = await inPage(extractCaptions, {
      window: { __fuchine: { tracks: [track(A, body)] } },
      player: playerFor(A),
    })();
    expect(res).toMatchObject({ source: "intercepted" });
    expect("captions" in res && res.captions).toEqual([
      { idx: 0, startMs: 1000, endMs: 2500, text: "こんにちは" },
      { idx: 1, startMs: 3000, endMs: 3000, text: "元気？" },
    ]);
  });

  it("returns no lines for malformed json3", async () => {
    const res = await inPage(extractCaptions, {
      window: {
        __fuchine: { tracks: [track(A, "{not json")] },
        ytInitialPlayerResponse: { videoDetails: { videoId: A }, captions: undefined },
      },
      player: playerFor(A),
    })();
    // Intercepted track is unusable and there is no JP track to re-fetch.
    expect(res).toMatchObject({ error: "no-ja", langs: [] });
  });

  it("parses the XML (srv1) format: seconds → ms, optional dur, tags stripped, entities decoded", async () => {
    const body =
      '<?xml version="1.0" encoding="utf-8" ?><transcript>' +
      '<text start="1.5" dur="2.25">&lt;b&gt; &amp; &#39;a&#39; &quot;b&quot;</text>' +
      '<text start="4.0">no <font color="#fff">dur</font> &#12354;</text>' +
      '<text start="5" dur="1">   </text>' +
      "</transcript>";
    const res = await inPage(extractCaptions, {
      window: { __fuchine: { tracks: [track(A, body)] } },
      player: playerFor(A),
    })();
    expect("captions" in res && res.captions).toEqual([
      { idx: 0, startMs: 1500, endMs: 3750, text: `<b> & 'a' "b"` },
      { idx: 1, startMs: 4000, endMs: 4000, text: "no dur あ" },
    ]);
  });
});

describe("extractCaptions — picking the current video's track", () => {
  const line = (t: string) => json3([{ tStartMs: 0, dDurationMs: 1, segs: [{ utf8: t }] }]);

  it("uses the live player id and ignores tracks captured for other videos", async () => {
    const res = await inPage(extractCaptions, {
      window: {
        __fuchine: { tracks: [track(B, line("B")), track(A, line("A"))] },
        // Stale SPA state: the initial response still describes video A.
        ytInitialPlayerResponse: { videoDetails: { videoId: A, title: "Title A" } },
      },
      player: playerFor(B),
    })();
    expect(res).toMatchObject({
      url: `https://www.youtube.com/watch?v=${B}`,
      title: `Title ${B}`,
      channel: `Chan ${B}`,
      durationS: 124,
      language: "ja",
      source: "intercepted",
    });
    expect("captions" in res && res.captions.map((c) => c.text)).toEqual(["B"]);
  });

  it("prefers a manual track over ASR, and accepts tlang=ja", async () => {
    const tracks = [
      track(A, line("manual")),
      { ...track(A, line("asr"), "&kind=asr") },
      { url: `https://www.youtube.com/api/timedtext?v=${A}&lang=en&tlang=ja`, body: line("translated"), at: 0 },
    ];
    const res = await inPage(extractCaptions, { window: { __fuchine: { tracks } }, player: playerFor(A) })();
    // Last non-ASR JP-matching track wins (the tlang one was fetched last).
    expect("captions" in res && res.captions[0]!.text).toBe("translated");

    const onlyAsrAndManual = await inPage(extractCaptions, {
      window: { __fuchine: { tracks: tracks.slice(0, 2) } },
      player: playerFor(A),
    })();
    expect("captions" in onlyAsrAndManual && onlyAsrAndManual.captions[0]!.text).toBe("manual");
  });

  it("falls back to ASR when it is the only JP track", async () => {
    const res = await inPage(extractCaptions, {
      window: { __fuchine: { tracks: [track(A, line("asr"), "&kind=asr")] } },
      player: playerFor(A),
    })();
    expect("captions" in res && res.captions[0]!.text).toBe("asr");
  });

  it("ignores non-Japanese captured tracks", async () => {
    const en = { url: `https://www.youtube.com/api/timedtext?v=${A}&lang=en`, body: line("en"), at: 0 };
    const res = await inPage(extractCaptions, {
      window: {
        __fuchine: { tracks: [en] },
        ytInitialPlayerResponse: {
          videoDetails: { videoId: A },
          captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: "en", baseUrl: "u" }] } },
        },
      },
      player: playerFor(A),
    })();
    expect(res).toEqual({ error: "no-ja", langs: ["en"], captured: 1 });
  });

  it("asks for CC (and doesn't re-fetch) when the player response belongs to another video", async () => {
    const fetchSpy = vi.fn();
    const res = await inPage(extractCaptions, {
      window: {
        __fuchine: { tracks: [track(A, line("A"))] },
        ytInitialPlayerResponse: {
          videoDetails: { videoId: A },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [{ languageCode: "ja", baseUrl: "https://www.youtube.com/api/timedtext?v=A" }],
            },
          },
        },
      },
      player: playerFor(B),
      fetch: fetchSpy,
    })();
    expect(res).toEqual({ error: "needs-cc", tried: [], captured: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("without a player, reads metadata from ytInitialPlayerResponse", async () => {
    const res = await inPage(extractCaptions, {
      window: {
        __fuchine: { tracks: [track(A, line("x"))] },
        ytInitialPlayerResponse: {
          videoDetails: { videoId: A, title: "T", author: "C", lengthSeconds: "61" },
        },
      },
      player: null,
    })();
    expect(res).toMatchObject({ url: `https://www.youtube.com/watch?v=${A}`, title: "T", channel: "C", durationS: 61 });
  });
});

describe("extractCaptions — baseUrl re-fetch fallback", () => {
  const pr = (kindAsr = false) => ({
    videoDetails: { videoId: A },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { languageCode: "en", baseUrl: "https://yt/en" },
          { languageCode: "ja", kind: "asr", baseUrl: "https://yt/ja-asr?x=1" },
          ...(kindAsr ? [] : [{ languageCode: "ja", baseUrl: "https://yt/ja?x=1" }]),
        ],
      },
    },
  });

  it("tries default then json3 on the manual JP track and reports what it tried", async () => {
    const calls: string[] = [];
    const res = await inPage(extractCaptions, {
      window: { ytInitialPlayerResponse: pr() },
      player: playerFor(A),
      fetch: async (url) => {
        calls.push(url);
        const body = url.endsWith("fmt=json3")
          ? json3([{ tStartMs: 5, dDurationMs: 5, segs: [{ utf8: "やった" }] }])
          : ""; // gated: 0 bytes
        return { status: 200, text: async () => body };
      },
    })();
    expect(calls).toEqual(["https://yt/ja?x=1", "https://yt/ja?x=1&fmt=json3"]);
    expect(res).toMatchObject({ source: "baseUrl:json3", captions: [{ idx: 0, startMs: 5, endMs: 10, text: "やった" }] });
  });

  it("returns needs-cc with the attempts when every variant is gated", async () => {
    const res = await inPage(extractCaptions, {
      window: { ytInitialPlayerResponse: pr(true) },
      player: playerFor(A),
      fetch: async (url) => {
        if (url.endsWith("fmt=json3")) throw new Error("boom");
        return { status: 200, text: async () => "" };
      },
    })();
    expect(res).toEqual({
      error: "needs-cc",
      tried: [
        { fmt: "default", status: 200, bytes: 0 },
        { fmt: "json3", err: "boom" },
      ],
      captured: 0,
    });
  });
});

describe("primeCapture", () => {
  it("reports not ready without a player", () => {
    expect(inPage(primeCapture, { player: null })()).toEqual({ ready: false });
  });

  it("mutes, plays and turns on the Japanese caption track", () => {
    const p = {
      getPlayerState: () => 1,
      mute: vi.fn(),
      playVideo: vi.fn(),
      setOption: vi.fn(),
    };
    expect(inPage(primeCapture, { player: p })()).toEqual({ ready: true, state: 1 });
    expect(p.mute).toHaveBeenCalled();
    expect(p.playVideo).toHaveBeenCalled();
    expect(p.setOption).toHaveBeenCalledWith("captions", "track", { languageCode: "ja" });
    expect(p.setOption).toHaveBeenCalledWith("captions", "reload", true);
  });
});
