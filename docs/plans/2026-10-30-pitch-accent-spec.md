# Pitch accent from Kanjium (T3.2)

**Date:** 2026-10-30
**Roadmap:** T3.2 in `docs/ROADMAP_ENGENHARIA.md` (Fase 3); base for T3.3 (Lapis
export: `PitchPosition`, `PitchCategories`) and T3.4 (Yomitan pitch dictionaries)
**Evidence:** `docs/PESQUISA_MERCADO-2026-10-29.md` §4 (pitch accent is table
stakes; every mining note type carries it)
**Status:** Implemented

## Source and license (verified 2026-10-30)

- Repo: `mifunetoshiro/kanjium`, file `data/source_files/raw/accents.txt`
  (124,137 lines: `expression<TAB>reading<TAB>accents`; empty reading = kana-only
  word). Pinned to commit `9ebca4589565c696e7c39e089e2e928ad65f678c` (master on
  that date; override with `KANJIUM_REF`).
- `LICENSE.txt` at that commit is the full **Creative Commons
  Attribution-ShareAlike 4.0 International** legal code (sha256
  `638cc6f2…8e69e9`). The README says the same: "Everything in this package is
  licensed under the Creative Commons Attribution-ShareAlike 4.0 International
  license … free to use or modify the data however you like (for commercial or
  non-commercial purposes)", and asks that the additions be credited with: "The
  pitch accent notation, verb particle data, phonetics, homonyms and other
  additions or modifications to EDICT, KANJIDIC or KRADFILE were provided by
  Uros O. through his free database."
- The "GPL" an aggregator lists comes from the README's note on
  `word_segmentation.txt`: a link to a third-party GPL script (Ryuujouji) that
  is explicitly **not** part of the package. Nothing in `accents.txt` is GPL.
- Compatibility: CC BY-SA 4.0 is the same license as JMdict, which we already
  consume the same way. The data is downloaded at seed time and never committed
  (only a 15-line excerpt as a test fixture, attributed in `NOTICE`); the
  database rows stay a ShareAlike derivative of Kanjium/EDICT, separate from the
  AGPL code. Attribution lives in `NOTICE` and in the UI ("Pitch: Kanjium").

## Data: a `word_pitch` table (migration 0019), not a column

```
word_pitch(id uuid pk, language text default 'ja', lemma text, reading text,
           positions int[], source text)
unique (language, lemma, reading, source)
```

Joined to `word_entries` on the natural key `(language, lemma, reading)`; no FK.

Why a table instead of `word_entries.pitch`:

1. **Provenance and multiple sources.** T3.4 imports Yomitan pitch dictionaries
   (NHK-style, 新明解…). A `source` column per row keeps each attributed and lets
   them coexist; a single column would need a jsonb keyed by source, rewritten
   on every import.
2. **Independent seeds.** The JMdict seed upserts `word_entries` and the pitch
   seed upserts `word_pitch`; neither touches the other, and they run in any
   order (no FK). A JMdict refresh can never wipe pitch, and vice versa.
3. **Coverage mismatch.** Kanjium has words JMdict's `(lemma, primary reading)`
   rows don't (alternative readings like 今日 こんにち); they are kept and match
   as soon as such a row exists.
4. **Cost.** The unique index's `(language, lemma, reading)` prefix serves the
   lookup; the dictionary already fetches entries in small batches (≤ 20), so
   one extra indexed query per payload is negligible.

`positions` keeps **every** downstep the source lists, in source order and
deduplicated. Kanjium's POS qualifiers (`(副)0,(名)3`) are dropped in this
version (17,212 words have more than one accent; 186 qualify them by POS); if a
note type needs them later they can go in an extra column.

## Seed

- `pnpm --filter @fuchine/db seed:pitch` — downloads the pinned `accents.txt`
  into `packages/db/seeds/data/` (gitignored) and upserts on
  `(language, lemma, reading, source)`. Idempotent. Prints the row count and how
  many `word_entries` have a match.
- `seed:pitch <file>` / `seed:pitch:fixture` — a local file / the committed
  excerpt (`packages/db/seeds/fixtures/kanjium-accents-sample.txt`).
- Run in the documented fresh-install steps right after `seed:jmdict`
  (`docs/SELF_HOSTING.md` §2, `docs/DEPLOY_CHECKLIST.md`).

Measured on 2026-10-30: 124,137 lines → **124,134 rows** (βカロテン is repeated
4×), 141,946 accents. The JMdict match rate over the full dictionary could not
be measured in the build sandbox (GitHub release downloads are blocked there);
the seed prints it, so record it at the first real deploy (T2.7).

## Rendering

`packages/core/src/pitch.ts` (pure, shared by UI and the T3.3 export):

- `splitMorae(reading)` — small ゃゅょ/ぁぃぅぇぉ/ゎ (and katakana) join the
  previous mora; っ, ー and ん are morae.
- `pitchPattern(reading, n)` — per-mora high/low, particle pitch, drop index,
  category. 0 = heiban (L H H…, particle high); 1 = atamadaka (H L L…);
  n = mora count = odaka (L H…H, drop onto the particle); otherwise nakadaka.
- `pitchCategory`, `pitchCategories`, `PITCH_CATEGORY_LABEL` (平板 / 頭高 / 中高 / 尾高).

`@fuchine/ui` `PitchAccent`: overline on high morae, a tick at the drop, a
dashed stub for the following particle (overlined only for heiban), the
category in English + kanji, `[n]`, and "Pitch: Kanjium" underneath. Shown in
the dictionary popup (player) and the dictionary screen's detail panel; not on
the focal subtitle line.

## API

No new route. `lookupById`, `searchDictionary` and `searchByGloss`
(`apps/web/lib/dictionary.ts`) attach `pitch: { reading, positions, source }[]`
(empty when unknown) via `withPitch` — one query per batch. `GET
/api/dictionary?id=` and `?q=` therefore carry it; auth and `isUuid` guards are
unchanged. The dictionary screen fetches `?id=` when a detail panel opens (the
paginated list endpoints stay one query per page).

## Tests

- Unit: `packages/core/src/pitch.test.ts` (箸 1 atamadaka, 橋 2 odaka, 端 0 heiban,
  日本 にほん 2 nakadaka, small kana, ー/っ, out of range),
  `packages/db/src/seed/pitch.test.ts` (parser, POS qualifiers, merge, fixture),
  `packages/ui/src/components/PitchAccent/PitchAccent.test.ts` (SSR render).
- E2E: `apps/web/scripts/e2e-dictionary.ts` §5 seeds the fixture twice
  (idempotent) and checks pitch in id / reading / gloss payloads.
