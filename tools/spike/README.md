# Captions spike

Answers the F0 risk-gate question (ROADMAP_ENGENHARIA): **can we fetch a video's
Japanese caption track reliably from the server, or must the browser extension
be the primary ingestion path?** The verdict decides how T0.7/T0.8 are built.

## How it works

`captions.mjs` (zero deps, Node 22+):

1. **Self-seeds** test videos by scraping YouTube search for a Japanese query
   (override with an explicit list instead).
2. For each video, tries server-side methods to get the `ja` caption track:
   - **innertube** — the `youtubei/v1/player` API (no page scrape)
   - **watch-page** — parse `ytInitialPlayerResponse` from the watch HTML
   - **yt-dlp** — if installed on PATH
   Each resolves the track and fetches it as `json3`, recording manual vs ASR,
   line count, a sample line, latency, and any error.
3. Prints a **verdict** + per-method success table.

It never throws on a fetch failure — failures are the measurement. Exits 0.

## Running it (no manual investigation needed)

**GitHub Actions (recommended — real internet):** the `Captions spike` workflow
runs automatically when the harness changes, and can be re-run from the Actions
tab ("Run workflow") with a custom query or an explicit `videos` list. The
verdict appears in the job summary; raw output is uploaded as an artifact.

**Locally:**

```bash
node tools/spike/captions.mjs
# options:
SPIKE_QUERY="アニメ 公式" SPIKE_LIMIT=8 node tools/spike/captions.mjs
SPIKE_VIDEOS=dQw4w9WgXcQ,abc... node tools/spike/captions.mjs   # skip search
```

## Reading the verdict

- **SERVER-SIDE VIABLE** (≥80%): keep server ingestion; build T0.7/T0.8 as planned;
  the extension stays a Phase 2 convenience.
- **PARTIAL** (40–80%): server works with retries/fallback but is flaky — plan the
  extension as a fallback ingestion path.
- **FRAGILE** (<40%): promote the extension to the primary ingestion path and
  reorder T0.7/T0.8 accordingly.
- **INCONCLUSIVE**: search seeding was blocked — re-run with `SPIKE_VIDEOS`.

The recommended method's name (innertube / watch-page / yt-dlp) is what T0.8
should implement first.

## Findings

**Run 1 — GitHub Actions (datacenter IP), 2026-06-15, query `日本語 ニュース`, 6 videos:**

| Method | Success |
|---|---|
| innertube | 0/6 — `captionTracks` absent in player response |
| watch-page | 0/6 — `captionTracks` absent in `ytInitialPlayerResponse` |
| yt-dlp | 0/6 — `Sign in to confirm you're not a bot` |

Verdict printed: **SERVER-SIDE FRAGILE**. **Important caveat:** search seeding
worked (connectivity + parsing are fine), so the failures are YouTube **gating
caption data for unauthenticated datacenter IPs** — GitHub runners are the
worst case for this, not a representative self-host. yt-dlp's bot wall confirms
it. This is a strong signal that **cloud server-side ingestion is bot-gated**
(needs residential proxies or cookies), and that the **browser extension**
(residential IP + user session) is the robust primary ingestion path — matching
the roadmap's contingency to promote the extension into Phase 0.

**Run 2 — residential IP (Windows, Node 24), v2 diagnostic, query `日本語 ニュース`:**

| Method | JP downloaded | JP seen | JP gated |
|---|---|---|---|
| innertube-web | 0/6 | 0 | 0 (returns no captions field) |
| watch-page | 0/6 | 4 | **4 — track visible, content 0 bytes** |

Verdict: **SERVER-SIDE GATED.** On a residential IP the watch page *does* expose
the JP caption track metadata, but the timedtext **content download returns 0
bytes** — the content endpoint now requires a browser session / PO token. Only
auto (`ja(asr)`) tracks appeared in the news test set, but the gate is on the
content endpoint, so manual tracks fetch the same way.

### Decision

**Browser extension = primary ingestion path** (promoted from Phase 2 to Phase
0). The extension runs in the user's authenticated browser, where the YouTube
player fetches captions legitimately; it submits the caption lines + timestamps
to the import API (D7: the extension is just another door to the same API).

- **T0.7** stays — the import API — but its primary input is captions *submitted
  by the extension*, not fetched by the server.
- **T0.8** (server-side caption-fetch job) is demoted to a best-effort fallback
  (self-host on residential IP, or with cookies / a PO-token provider); it is no
  longer on the F0 critical path.

Server-side fetch was confirmed gated on **both** datacenter (run 1) and
residential (run 2) IPs, so this is not an IP-reputation artifact.

