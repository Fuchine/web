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
