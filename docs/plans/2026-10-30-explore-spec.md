# Calibration loop, i+1 lines and Explore (T3.10)

**Date:** 2026-10-30
**Roadmap:** T3.10 in `docs/ROADMAP_ENGENHARIA.md` (Fase 3, innovation 1 part 2; builds on T3.9)
**Evidence:** `docs/PESQUISA_MERCADO-2026-10-29.md` §5 innovation 1 — nobody ranks videos by
*personal* coverage; AnkiMorphs (the i+1 tool) is archived; narrow viewing (Rodgers & Webb
2011: related programs repeat mid/low-frequency words) supports "same channel/series"; target
coverage for comprehensible input ≈ 90–95% (Durbahn et al. 2024; ~96% for Japanese, Komori
et al. 2004).
**Status:** Implemented (migration 0022)

## What shipped

| Piece | Where |
|---|---|
| i+1 detection (pure + one query per page) | `apps/web/lib/i-plus-one.ts` |
| i+1 in the player transcript: marker, dotted target word, "Show i+1 lines" filter, "Mine this i+1 line" | `packages/ui/src/components/Player/PlayerTranscript.tsx`, `Player.tsx` |
| i+1 in the curation screen: card badge + per-video suggestions | `apps/web/app/phrases/curate/curate-view.tsx`, `GET /api/videos/[id]/i-plus-one` |
| Explore page + nav item | `apps/web/app/explore/`, `packages/ui/.../AppShell/nav.tsx` |
| Ranking (pure) | `apps/web/lib/explore-rank.ts` |
| Two-stage read, freshness, cold start | `apps/web/lib/explore.ts`, `apps/web/lib/starter-channels.json` |
| Per-user coverage materialization | `packages/db/src/user-coverage.ts` → `user_video_coverage` |
| Calibration loop (daily job) | `packages/db/src/calibration.ts`, `apps/worker/src/maintenance.ts` |
| Watch progress per video (narrow viewing) | `user_video_progress`, written by the beacon (`lib/progress.ts`) |
| Metadata freshness | `videos.fetched_at`, `lib/import.ts` (re-capture), `pnpm --filter @fuchine/worker refresh:metadata` |
| Tests | `lib/i-plus-one.test.ts`, `lib/explore-rank.test.ts`, `packages/db/src/calibration.test.ts`, `apps/worker/src/metadata.test.ts`, E2E `apps/web/scripts/e2e-explore.ts`, bench `apps/web/scripts/bench-explore.ts` |

The known-word model (tier rule, SQL, coverage math) and the calibration moved from
`apps/web/lib` to `@fuchine/db` so the worker can run them without a new dependency
(the worker depends on `@fuchine/db`, not `@fuchine/core`); `apps/web/lib/known-words.ts`
and `lib/calibration.ts` re-export. The pure token-override core moved to the
`@fuchine/db/token-overrides` subpath (client-safe, types-only imports) and
`@fuchine/core` re-exports it, so calibration applies a user's corrections exactly like the
web app.

## 1. i+1 per line

A line is **i+1** for a user when exactly **one distinct countable word** is not
`confirmed`/`likely` and at least **2** countable words are (`I_PLUS_ONE_MIN_KNOWN`).

- *Countable* = the T3.9 coverage rule (`isCoverageToken`): particles and auxiliaries count;
  proper nouns, numerals, symbols, interjections, fillers and entry-less tokens are ignored —
  they neither make nor break a line.
- *Distinct word*, not token: a new word repeated in the line (ねえ、ねえ) is still one new
  item. This is the only deviation from a literal "one token" reading; it matches what i+1
  means pedagogically (one new form–meaning pair) and AnkiMorphs' morph-level unit.
- The 2-known minimum keeps one-word lines (「猫！」) out: no context to infer from.
- Tokens are the **user's corrected tokens** (T3.7) and tiers use the **calibrated** threshold.
- Cost: one query per page — `word_entries` PK ⟕ `user_word_stats` PK ⟕ `saved_words` PK,
  tiered by `wordTierSqlFor(minViews)`. Bench: **19 ms** for a 300-line player page.

UI: the transcript shows a small "i+1" chip under the timecode and a dotted underline on the
new word; a "+1" tool filters the rail to i+1 lines (with count); hovering (or the current
row, or touch devices) reveals **"Mine this i+1 line"** — it calls the same `POST /api/cards`
as **M**, targeting the new word in the mining toast. The curation screen badges cards whose
line is i+1 ("i+1 · 単語") and, under each video group, lists up to 3 **unmined** i+1 lines of
that video with their own "Mine this i+1 line". **Nothing is ever mined automatically.**

The player's client-side lookups (a popup open demotes *likely*) don't recompute i+1 until
the next load — acceptable: i+1 is a suggestion, and the next visit is exact.

## 2. Explore — ranking

```
score = fit(coverage, band)                        ∈ [0, 1]
      + 0.15 · novelty(newCommonWords)             ∈ [0, 0.15]
      + 0.20 · [same channel watched in 30 days]   ∈ {0, 0.2}

fit:      1 at the band center, 0.5 at the edges, linear to 0 at 10 points outside
novelty:  0 below k = 3 unknown common words, then n / 12 (capped at 1)
common:   frequency_rank ≤ 5000 (nf01–nf10 bands of JMdict)
```

- **Coverage** = the T3.9 headline (token-weighted, calibrated `LIKELY_WEIGHT`).
- **Band**: default **90–95%**; presets 85–90 (stretch) and 95–98 (easy), via `?band=lo-hi`
  (validated: 60 ≤ lo < hi ≤ 98; anything else → default).
- **Weights**: inside a 5-point band, fit moves 0.2 per coverage point, so the narrow boost
  (0.2) is worth ~1 point and full novelty (0.15) ~0.75 point — coverage dominates ("closest
  to the band center first"); the boosts break near-ties. A same-channel video 10 points out of
  the band never beats an in-band one (unit-tested).
- **Exclusions**: flagged `hidden`/`not_interested` by this user; watched ≥ 80% of its
  duration (`user_video_progress`); headline ≥ **98%** (comfortable — little to learn); no
  number (< 50 countable tokens or < 10 distinct words); status ≠ done.
- **Explanation on each card**: `94% covered · 12 new common words · same channel as “…”`
  (the title of the most recently watched video of that channel). "Not interested" on the
  card writes the existing flag.
- **Cold start**: when the user has < 100 known (confirmed + likely) words, or Explore has
  < 5 results, the page also shows the curated starter channels (§4).

## 3. Explore — scaling (the decision)

**Requirement**: never compute coverage for the whole catalog per request.

**Chosen: per-user materialized pre-filter + exact second stage**, i.e. both suggested
options combined:

1. **`user_video_coverage`** (user, video → token/word sums per tier + `new_common_words`),
   filled by **one `INSERT … SELECT … GROUP BY video ON CONFLICT DO UPDATE`** over
   `video_word_counts` ⋈ `videos` ⋈ `word_entries` ⟕ the user's `user_word_stats` /
   `saved_words` (`refreshUserVideoCoverage`). The likely weight is applied on read, so a new
   calibration doesn't invalidate it (a new min-views threshold does, at the next refresh).
2. **Request** (`getExplore`): read ≤ 200 materialized rows nearest the band center with the
   exclusions in SQL → rank → recompute the **exact** coverage of the shown 24 (+8 margin)
   with `getComprehensionByVideo` (applies the user's token corrections, which the
   materialization ignores) → re-rank.
3. **Freshness — stale-while-revalidate**: the first Explore visit materializes synchronously
   (one-off); later visits serve the table and, if it is stale — `user_word_stats` or
   `saved_words` changed since, or a video was imported since, or it is older than 6 h (the
   14-day lookup decay is time-based) — enqueue a `refresh-coverage` job for that user on the
   worker's `maintenance` queue (jobId-deduplicated, throttled to one per 5 min). The page
   says "Updating with your latest activity" meanwhile.

**Why not refresh on every review/beacon write?** The beacon fires every 15 s and changes
views for dozens of words, each appearing in up to the whole catalog: incremental fan-out on
write would cost more than the periodic full recompute, and most users never open Explore
between two beacons. Refreshing *on read, in the background, only for users who use Explore*
puts the cost where the value is. **Why not a two-stage SQL pre-filter by word overlap
alone?** Overlap with the user's known words *is* the coverage join (common words sit in every
video), so it doesn't prune the work; for a learner who knows 10k words it is as expensive as
the full aggregate.

### Measured (synthetic catalog, `scripts/bench-explore.ts`)

Postgres 16, local, default config; 20,000 ranked words; each video 300 lines × 8 tokens drawn
Zipf-like (`rank = ⌈W·u¹⁴⌉`: the top 3,000 words cover ~87% of tokens, as in real
Japanese) → **777 distinct words/video**; one learner knowing the top 3,000 (1/3 confirmed,
2/3 likely). Medians:

| Catalog | `video_word_counts` rows | A. naive: whole-catalog coverage per request | B. materialize (background, once per refresh) | **C. Explore request** | D. i+1, 300-line page |
|---|---|---|---|---|---|
| 2,000 videos | 1.55 M | 797 ms | 1,319 ms | **41 ms** | 19 ms |
| 8,000 videos | 6.22 M | 2,375 ms | 3,637 ms | **85 ms** | 21 ms |

A grows linearly with the catalog and would run on every page view; C reads one row per
candidate and does the exact aggregate for 32 videos only — **×19 faster at 2,000 videos, ×28 at 8,000**,
and the gap widens with the catalog. B is the price of a refresh, paid in the worker at most
every 5 minutes per active Explore user (and once synchronously on the first visit).

## 4. Cold start — curated channels

`apps/web/lib/starter-channels.json`: **13** comprehensible-input channels with a suggested
level (beginner → advanced) and a one-line note — Comprehensible Japanese, Nihongo no Jikan,
Learn Japanese with Noriko, Akane's Japanese Class, Nihongo con Teppei, Japanese Ammo with
Misa (flagged: explanations mostly in English), Japanese with Shun, Speak Japanese Naturally,
Miku Real Japanese, YuYu no Nihongo Podcast, Onomappu, Sayuri Saying, Nihongo no Mori.
Names only — **no handles, no thumbnails, no fetch**: the server cannot reach YouTube, and a
wrong handle is worse than a search. Each item links to a YouTube **search by name** and to
`/import` (the app can't import without the extension, which captures the captions in the
user's browser).

Verified by web search on 2026-10-30: Comprehensible Japanese (Yuki), Nihongo no Jikan
("Japanese Comprehensible Input", graded complete beginner → advanced), Learn Japanese with
Noriko (CI videos), Japanese Ammo with Misa, Nihongo no Mori (JLPT-focused). The others are
widely recommended CI channels from the curator's knowledge — re-check names before a public
launch. **Left out:** 「いろいろな日本語」 — no source confirming a channel by that name was
found; add it back once verified.

## 5. Metadata freshness (`videos.fetched_at`)

Metadata (title, channel, duration) comes from the extension, read from the YouTube page in
the user's own session — never from the Data API, whose terms forbid keeping API data longer
than 30 days without refresh and restrict derived metrics. We adopt the 30-day horizon as
hygiene anyway (the catalog is shared, D3):

- 0022 adds `videos.fetched_at` (not null, default now; **backfilled from `created_at`**).
- A re-import through the extension of an existing video **refreshes** title/channel/duration
  and `fetched_at` (only when the capture carries a title).
- `pnpm --filter @fuchine/worker refresh:metadata [--days 30] [--json] [--expire]` lists videos
  older than the horizon, oldest first, with the watch URL to re-open via the extension;
  `--expire` clears `channel` and `duration_s` on them (title, captions and study data stay —
  the title identifies the user's own material). The server never calls YouTube.
- Documented in `docs/ARQUITETURA.md` §5 and `docs/ARCHITECTURE.md`.

## 6. Calibration loop

The T3.9 report becomes a **daily worker job** (`calibrate-known-words`, BullMQ job scheduler
at 04:17 worker time on the `maintenance` queue; also `scripts/calibrate-known-words.ts --apply`):

- **Input**: the exact first-review snapshots only — `user_word_stats.first_review_tier =
  'likely'` with `first_review_ok` — one aggregate grouped by user (no `review_logs` replay;
  the detailed report with reconstructed rows stays in the script).
- **Per instance** (default): with ≥ **30** exact likely samples across the instance,
  `LIKELY_WEIGHT` = P(first review OK | likely), rounded to 0.01 and clamped to [0.3, 1], and
  a suggested `LIKELY_MIN_VIEWS` (below), stored in `instance_settings["known_words"]`
  (`KnownWordCalibration`: weight, min views, samples, raw rate, scope, computedAt). Below 30
  the row is removed → constants (0.7 / 10).
- **Per user**, only when that user alone has ≥ 30 exact likely samples:
  `user_settings.known_word_params` (same shape, scope `user`); others are cleared and inherit
  the instance. 30 is the same minimum the T3.9 report used; a per-user rate on fewer words
  has a ±15-point 95% interval and would make the headline jump.
- **`LIKELY_MIN_VIEWS` controller** (hysteresis): P(OK | likely) < 0.70 → raise by 2;
  > 0.90 → lower by 1; else keep; clamped to [5, 30]. It steps only when there are **new**
  samples since the stored calibration, so re-running on the same data never ratchets it. One
  step per day keeps the threshold drifting rather than jumping.
- **Use**: `loadKnownWordParams(db, userId)` resolves user → instance → constants (two PK
  lookups); `getComprehensionByVideo`, `getWordStatuses` (player colors), albums, i+1,
  Explore's materialization and the first-review snapshot writer all take it, so the tier the
  user sees, the coverage number and the next calibration sample use the same rule.

Caveat (open): samples taken under different thresholds mix after a step; with daily steps and
a 30-sample floor this is a slow drift, not a feedback oscillation, but a per-threshold split
of the samples (store `first_review_views`) would make the controller exact.

## Verification

- Unit: i+1 detection (6), ranking/band/freshness/starter list (9), calibration math and the
  calibrated tier threshold (6), metadata horizon (1).
- E2E `e2e-explore.ts` (30 checks, real Postgres): ranking order on fixtures (same-channel 93%
  > 92% with novelty > 96% > 80%), hidden / watched / ≥ 98% excluded, per-user isolation (B
  sees what A hid and A's materialization is untouched), stale-while-revalidate (throttle,
  background request, worker refresh), i+1 lines flagged and per-user, suggestions drop a mined
  line, calibration writes nothing at 29 samples and 0.8 at 30 (24/30), the headline then uses
  it (92 likely tokens × 0.8 ⇒ 74%), re-run keeps the threshold.

## Open items

- Explore's materialization ignores token corrections (the shown page is exact); a heavy
  corrector could see a candidate drop between stages — rare by construction.
- i+1 is not recomputed on client-side lookups during a session.
- Per-word attribution of sentence reviews (T3.9 open item) still makes "confirmed" optimistic
  for long sentences, and so the calibration measures *likely* against that.
- `refresh:metadata` is operator-run; scheduling it (or surfacing stale rows in the UI) is a
  follow-up, as is a re-capture prompt in the extension (out of scope: `extension/` untouched).
- The starter list is unverified for 8 of 13 names (see §4).
