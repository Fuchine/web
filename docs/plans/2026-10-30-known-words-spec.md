# Known-word model + token-weighted coverage (T3.9)

**Date:** 2026-10-30
**Roadmap:** T3.9 in `docs/ROADMAP_ENGENHARIA.md` (Fase 3, innovation 1 part 1); basis
for T3.10 (calibration, i+1, Explore)
**Evidence:** `docs/PESQUISA_MERCADO-2026-10-29.md` §2 (WANTs: a comprehension number
learners can trust), §5 innovation 1, §6 ("A métrica de compreensão precisa mudar de forma")
**Status:** Implemented (migration 0021)

## Decision

Replace the v1 comprehension (% of *distinct* words "known", known = `reviewsOk ≥ 1 or
views ≥ 5`) with:

1. a **three-tier** per-(user, word) model — `unknown | likely | confirmed` — so the
   number never rests on a single optimistic signal (the LingQ trap: "known by not
   clicking");
2. **token-weighted coverage** (share of the video's *running* words) as the headline,
   the unique-word share as secondary, and a **confidence band** from the tiers:
   lower = confirmed only, upper = confirmed + likely. Shown as **"93% (89–95)"**;
3. the research thresholds on the UI: 80% minimum, 90% still hard for most learners,
   95% adequate (Durbahn et al., SSLA 2024; ~96% for Japanese, Komori et al. 2004),
   98% comfortable (Hu & Nation 2000, reading).

Everything lives in one module, `apps/web/lib/known-words.ts` (pure rule + the same
rule as SQL `wordTierSql`); `apps/web/lib/word-status.ts` stays the façade the player
coloring reads, so player, library, albums and calibration switch together.

## Tier rules

Inputs per (user, word): `user_word_stats` (views, clicks, reviews_ok, reviews_total,
**last_clicked_at**, **last_review_ok** — new in 0021) and the manual override
`saved_words.status` (`known | learning | new`).

In order:

| # | Rule | Rationale |
|---|---|---|
| 1 | manual **known** ⇒ confirmed; manual **new** ⇒ unknown | The user is the final authority. "Mark as unknown" in the dictionary popup writes `new` (one click; again to undo). |
| 2 | **confirmed** ⇔ `reviews_ok ≥ 1` **and** the most recent review of a card containing the word was OK (grade ≥ 3, the existing `reviews_ok` rule) | A correct review is the only explicit evidence. Legacy rows without a recorded last outcome fall back to "OK reviews ≥ failed reviews"; the migration seeds `last_review_ok` from `review_logs`. |
| 2b | a failed last review removes the confirmation but does **not** force unknown | A sentence card fails for one word, not all of them — otherwise は would drop out of every card the user ever missed. The word can still be likely by views. |
| 3 | **likely** ⇔ `views ≥ 10` **and** `clicks × 10 ≤ views` **and** no lookup in the last **14 days** | Seen often without lookup. N went from v1's 5 to **10**: the beacon counts a line as seen whether or not the learner attended to it, and incidental-learning studies put meaningful form–meaning gains at ~10+ encounters (Webb 2007; Peters & Webb 2018). ≤ 1 lookup per 10 sightings = "mostly read without help". |
| 3b | a lookup (popup open) within `LOOKUP_DECAY_DAYS = 14` demotes likely → unknown; after that the ratio alone decides | A lookup is direct evidence the word wasn't known *then*; 14 days ≈ a typical second FSRS interval, long enough to need re-exposure. Clicks before 0021 have no timestamp, so only the ratio applies to them. A lookup never demotes a **confirmed** word (checking a nuance ≠ not knowing it). |
| 4 | manual **learning** caps the result at likely (never raises) | "I'm still learning it" should keep it out of the lower bound. |
| 5 | otherwise unknown | |

Player colors (unchanged palette, T3.8): unknown → *unknown*, likely → *seen*
(furigana stays on), confirmed → *known* (furigana hidden in "unknown words only").
Words looked up during the session are demoted client-side by the same rule 3b.

All thresholds are constants in `known-words.ts`; T3.10 tunes them with the
calibration report.

## Coverage tokens (exclusions)

`isCoverageToken` in `@fuchine/nlp` (per language, D4). A Japanese token counts unless:

- it has **no dictionary entry** (`wordEntryId` null — names JMdict lacks, SFX, tokenizer
  debris, a user's "not a dictionary word" correction): knowledge is tracked per entry,
  so it could never become known;
- kuromoji POS is **記号** (symbols/punctuation), **感動詞** (interjections), **フィラー**
  (fillers: えーと), **その他**;
- kuromoji `pos_detail_1` is **固有名詞** (proper noun) or **数** (numeral) — the tokenizer
  now stores it as `Token.posDetail` (optional; tokens imported before T3.9 lack it, so the
  next two rules catch most of those cases);
- the surface is only digits / kanji numerals, only punctuation, or only Latin letters
  (ｗｗｗ, OK, YouTube);
- every JMdict POS tag of the resolved entry is `int`, `n-pr` or `num`.

**Particles (助詞) and auxiliaries (助動詞) are counted.** The 80/95/98% thresholds are
defined over running words *including* function words, so excluding them would make
the number incomparable with the research (and with jpdb, which counts them). They do
inflate coverage for a total beginner — but they reach *likely* within the first video
watched, so the effect is honest: a learner who reads は does know it.

## Coverage formula

Per (user, video), over coverage tokens, with per-tier sums of running occurrences
(`T`) and distinct words (`W`):

```
headline  = round(100 · (T_confirmed + 0.7 · T_likely) / T_total)
band      = [round(100 · T_confirmed / T_total), round(100 · (T_confirmed + T_likely) / T_total)]
unique    = round(100 · (W_confirmed + 0.7 · W_likely) / W_total)   (+ its own band)
```

`0.7` (`LIKELY_WEIGHT`) is P(known | likely) — a deliberately conservative prior until
the calibration report has data (the band always shows the full 0–1 range).
No number below **50 countable tokens or 10 distinct words** (one word would move it 2+
points). The client "Most comprehensible" sort uses the headline.

### Storage and query cost

`word_examples` keeps one row per (word, line) — it loses in-line repeats and carries
no POS — so running frequency is materialized in **`video_word_counts`** (video_id,
word_entry_id, occurrences; PK `(video_id, word_entry_id)`), written by the import in
the same transaction as the tokens (`apps/worker/src/word-counts.ts`, delete + insert —
idempotent) and by `pnpm --filter @fuchine/worker backfill:word-counts [--all]` for
older videos. ~1–2k rows per video, shared like `word_examples`.

Per library page (24 videos) `getComprehensionByVideo` runs:

1. **one aggregate** — `video_word_counts` (PK range per video) ⟕ `user_word_stats` (PK)
   ⟕ `saved_words` (PK), `GROUP BY video_id, tier` → ≤ 3 rows per video;
2. one indexed lookup of the user's `token_overrides` on those videos (usually empty);
3. only when there are corrections: one query for the involved words' POS + tier and
   one for their base counts. Corrected lines contribute `(corrected − original)`
   occurrence deltas per word; a word whose count crosses 0 enters/leaves the distinct
   count. Other users are untouched.

Albums use the same aggregate grouped by album (corrections not applied there).

## Calibration (basis for T3.10)

`pnpm --filter @fuchine/web exec tsx scripts/calibrate-known-words.ts [--user <id>]`
(logic in `apps/web/lib/calibration.ts`). For every (user, word) it finds the word's
**first review** in `review_logs` (the earliest review of any card whose line contains
the word — always some card's first review), and compares its grade with the word's tier
just before it:

- **exact** — the snapshot `user_word_stats.first_review_tier/ok` that the review writer
  records on the word's first review (from 0021 on);
- **reconstructed** — older words: the tier from today's views/clicks with reviews
  ignored (optimistic: views kept growing after the review).

It prints, per tier × source, the share whose first review was OK (≥ Good) and recalled
(≥ Hard), and suggests `LIKELY_WEIGHT` = P(OK | likely, exact) once there are ≥ 30
exact likely words. If likely words fail much more often than confirmed ones, raise
`LIKELY_MIN_VIEWS`. The E2E runs it on **synthetic** data (4 words, one learner) — there
is no real review history yet, so no real calibration number exists today.

## Before / after (jpdb fixture)

The market research quotes jpdb's CROSS†CHANNEL stats as "90% of unique words ≈ 34% of
running words, 95% ≈ 55%". Note on reading: jpdb's table maps *running coverage → share
of unique words needed* (to understand 90% of the running text you need the ~34% most
frequent unique words). For a learner whose knowledge follows frequency, unique-word %
therefore **under**states running coverage; it **over**states it when the known words
are the rare ones. The two metrics diverge in either direction — which is the point.

Fixture (`apps/web/lib/known-words.test.ts`, "before/after on the jpdb fixture"): 1000
distinct words, 10 000 running tokens, frequency bands A (top 340 words → 9000 tokens),
B (210 → 500), C (450, mostly hapax → 500). "Old" = v1 metric (distinct words with
`reviewsOk ≥ 1 or views ≥ 5`); "new" = this model.

| Learner on the fixture | Old (v1, unique) | New headline (band) | New unique (band) |
|---|---|---|---|
| Reviewed band A correctly (top 340 words) | 34% | **90% (90–90)** | 34% |
| Reviewed bands A + B (top 550 words) | 55% | **95% (95–95)** | 55% |
| Converse: reviewed all but A's top 100 words | 90% | **27% (27–27)** | 90% |
| Watched the video once, no lookups, no reviews (views = occurrences) | 30% | **58% (0–82)** | 11% (0–16) |
| …and looked up every non-A word today | 30% | **56% (0–80)** | 11% (0–16) |

The first two rows reproduce the jpdb pairs exactly (90 ⇔ 34, 95 ⇔ 55); the third shows
the literal reading (90% unique ≈ low running coverage, 27% here). The watch-only rows
show what the band is for: v1 would call 30% of the words "known" outright; the new
model says "somewhere between 0% and 82%, best guess 58%" until reviews confirm it.

E2E (`apps/web/scripts/e2e-comprehension.ts`, real Postgres): 70 running tokens / 25
words; with the fixture's signals v1 would say 8/25 = **32%**; the new model gives
**47% (16–60)**, unique 18% (12–20).

## Not done here

- ~~i+1 per line, "Explore" ordering by personal coverage; replacing `LIKELY_WEIGHT` /
  `LIKELY_MIN_VIEWS` with calibrated values and a periodic report~~ — done in T3.10, see
  `docs/plans/2026-10-30-explore-spec.md` (the model now lives in `packages/db/src/known-words.ts`);
- per-word attribution of sentence reviews (today a review confirms every word of the
  line — optimistic for long sentences);
- tokens without an entry are excluded, not counted as unknown; revisit with SudachiPy.
