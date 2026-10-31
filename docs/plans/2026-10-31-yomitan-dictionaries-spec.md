# Importing Yomitan dictionaries (T3.4)

**Date:** 2026-10-31
**Roadmap:** T3.4 in `docs/ROADMAP_ENGENHARIA.md` (Fase 3); builds on T3.2
(`word_pitch.source`) and T3.3 (Lapis `Frequency`/`FreqSort`)
**Evidence:** `docs/PESQUISA_MERCADO-2026-10-29.md` §4 — the Yomitan zip is the
ecosystem's de-facto dictionary format; monolingual dictionaries and
domain frequency lists are what learners already own and expect to bring.
**Status:** Implemented (migration 0023)

## Format followed

The JSON schemas of `yomidevs/yomitan`, `ext/data/schemas/` at master
`d3c54c10264673eca0d66b970ef74cd5c8b048e3` (fetched 2026-10-31):

| Schema | sha256 (as fetched) | Used for |
|---|---|---|
| `dictionary-index-schema.json` | `dde43ca9…598feb69b` | `index.json`: title, revision, `format`/`version` (alias), author, attribution, url, description, sourceLanguage, targetLanguage, frequencyMode |
| `dictionary-term-bank-v3-schema.json` | `665904fc…c8030b87` | `term_bank_N.json`: `[expression, reading, definitionTags, rules, score, glossary[], sequence, termTags]`, glossary = string \| `{type:"text"}` \| `{type:"structured-content"}` \| `{type:"image"}` \| deinflection `[term, rules[]]` |
| `dictionary-term-meta-bank-v3-schema.json` | `7236ea56…27262369` | `term_meta_bank_N.json`: `freq` (number \| numeric string \| `{value, displayValue}` \| `{reading, frequency}`), `pitch` (`{reading, pitches:[{position: int \| "HL…", nasal?, devoice?, tags?}]}`), `ipa` (ignored) |
| `dictionary-tag-bank-v3-schema.json` | (not pinned) | `tag_bank_N.json`: `[name, category, order, notes, score]` → `dictionaries.tag_meta` |

Only **format 3** is accepted (formats 1/2 predate 2017; no current
dictionary uses them). Kanji banks, images and `styles.css` are ignored.

## Who installs, who chooses

- **Instance-level.** The operator installs dictionaries; nothing is shipped
  with Fuchine and nothing is downloaded by it. Primary path: the worker CLI
  `pnpm --filter @fuchine/worker dict:import <zip>` (`dict:list`,
  `dict:remove <title>`). Secondary: an **admin-only** upload in Settings →
  Dictionaries, gated by `ADMIN_EMAILS` (comma-separated; unset = nobody). The
  admin can also disable (hidden for everyone) or remove a dictionary.
- **Licensing.** The operator is responsible for having the right to use what
  they import. Said in the Settings admin panel, `docs/SELF_HOSTING.md` and the
  CLI header. Fuchine stores each dictionary's `attribution`/`author`/`url`
  from its `index.json` and shows them in the admin list.
- **Per user.** `user_settings.dictionary_prefs` (jsonb):
  `{ enabled: string[] (dictionary ids, in display order), frequency: string | null }`.
  Default (null) = nothing extra: JMdict + Kanjium as before. A dictionary the
  admin disabled or removed silently drops out of everyone's choice.

## Data (migration 0023)

```
dictionaries(id, title UNIQUE, revision, format_version, type terms|frequency|pitch,
             language, target_language, frequency_mode, author, attribution, url,
             description, tag_meta jsonb, term_count, frequency_count, pitch_count,
             imported_at, enabled)
dictionary_terms(id, dictionary_id → dictionaries ON DELETE CASCADE, language,
                 expression, reading, definitions jsonb (DictDefinition[]), tags text[],
                 score real, sequence int)
  idx (language, expression), (language, reading), (dictionary_id)
word_frequency(dictionary_id → CASCADE, language, expression, reading ('' = any),
               value double, display_value, rank int)
  PK (dictionary_id, language, expression, reading)
word_pitch + dictionary_id → CASCADE (null = seeded source such as Kanjium), idx
user_settings + dictionary_prefs jsonb
```

- **Identity = title.** Re-importing a title (same or newer revision) replaces
  all its rows **in one transaction** and keeps the row id, so users' choices
  survive an update; a failed import leaves the previous revision intact.
  `kanjium` is a reserved title (it is the seeded `word_pitch.source`).
- **`type`** is the primary kind for the UI (terms if any term bank, else
  frequency, else pitch); the three counts say what a mixed dictionary holds.
- **Monolingual** = has terms and `targetLanguage == sourceLanguage`.
- **Frequency `rank`** is always "lower = more frequent": the value itself for
  `rank-based` (or unspecified) lists, the position by descending value for
  `occurrence-based` ones, so FreqSort can use either. Duplicated
  (term, reading) rows keep the most frequent figure.
- **Pitch** goes into the existing `word_pitch` with `source` = the
  dictionary's title (T3.2 designed `source` for this); `"HL"` strings become
  the downstep mora of the first H→L drop (0 = none).
- Readings: a `""` reading in a term bank means "same as the expression" and is
  stored resolved. Frequency rows without a reading keep `''` and match every
  reading of the expression.

## Importer safety (`packages/db/src/dictionaries/yomitan.ts`)

- In-memory only, via `fflate` (already a dependency): the central directory is
  listed first (no inflation), then one bank at a time is inflated and
  `JSON.parse`d. Nothing is written to disk, nothing is executed.
- Rejected archives: any entry whose name is absolute, has a `..` segment, a
  backslash, a drive letter or NUL (zip-slip shapes); more than 50,000 entries;
  no root `index.json`; declared uncompressed size of the banks read over
  `DICT_MAX_UNCOMPRESSED_MB` (default **200**). fflate inflates each file into a
  buffer of its declared size, so a lying header cannot inflate past it.
- Malformed rows are skipped and counted (reported by the CLI), never fatal.
- Batch inserts (1,000 terms / 4,000 meta rows per statement).

## Rendering: structured content → React

`sanitizeStructuredContent` (`packages/db/src/dictionaries/structured-content.ts`)
runs **at import and again in the renderer** (`@fuchine/ui` `StructuredContent`):

- Tags kept: `div span ul ol li table thead tbody tfoot tr td th ruby rt rp br a
  details summary` (details/summary render flat). Unknown tags are unwrapped
  (their text stays). `img` (and script/style/iframe/object/embed) is
  **dropped** — images are not imported in this version.
- `a`: only absolute `http(s)` URLs survive, rendered with `target="_blank"
  rel="noopener noreferrer nofollow"`; Yomitan's internal `?query` links and
  any other scheme become a plain span.
- Attributes: `lang` (BCP-47 shape), `title` (≤ 200 chars), `colSpan`/`rowSpan`
  (1..50, td/th). `data` (data-* attributes) is dropped.
- Style allowlist: `fontWeight: bold`, `fontStyle: italic`,
  `textDecorationLine: underline | line-through | overline`,
  `verticalAlign: sub | super`. No colors, sizes, margins or any free-form CSS.
  The dictionary's own `styles.css` is ignored; our CSS (`.sc-*` in
  `popup.css`) styles lists, tables and ruby.
- Budget per definition: depth ≤ 32, ≤ 4,000 nodes, ≤ 64 KiB of text.
- React elements only — never HTML strings or `dangerouslySetInnerHTML`.

## Lookup (`apps/web/lib/dictionaries.ts`)

`GET /api/dictionary?id=` (popup and dictionary detail) returns, besides the
JMdict entry and pitch:

- `dictionaries`: one section per **enabled term dictionary, in the user's
  order** — entries whose `(expression, reading)` equals the JMdict
  `(lemma, reading)` (kana-only words also by their kana headword); when a
  dictionary has none, its entries for the lemma under any reading; ≤ 4 per
  dictionary, by score.
- `frequencies`: the rank in each enabled frequency list (exact reading or
  reading-less row first, else the lemma's best).
- `pitch`: Kanjium (seeded) always, then the enabled pitch dictionaries in the
  user's order. Search results (`?q=`) and users without choices see seeded
  pitch only.

Two indexed queries per batch (terms, frequencies) + one for pitch, whatever
the batch size; `lookupById` adds two small queries for the user's prefs.

## Lapis export

With a chosen list (`dictionary_prefs.frequency`), `FreqSort` = the word's rank
in it, falling back **per word** to the JMdict rank, then 9999999; `Frequency`
lists `<chosen title>: <display value or rank>` then `JMdict: <rank>`. The
target-word choice is unchanged (JMdict rank, same rule as the review Cloze).
`PitchPosition`/`PitchCategories` use Kanjium plus the user's enabled pitch
dictionaries.

## Admin upload

`POST /api/admin/dictionaries` (raw `application/zip` body): 401 without a
session, 403 for a non-admin **before the body is read**, body counted against
`DICT_MAX_UNCOMPRESSED_MB` (413), import errors → 422. Caddy keeps its 2 MB cap
everywhere except `POST /api/admin/dictionaries`, which gets 100 MB (bigger
dictionaries go through the CLI). The import runs inside the request.
`PATCH`/`DELETE /api/admin/dictionaries/[id]` toggle/remove. User prefs:
`GET`/`PUT /api/settings/dictionaries`.

## Measured (2026-10-31, dev sandbox, Postgres 16, empty DB)

| Dictionary (license) | Zip | Uncompressed | Rows | Time |
|---|---|---|---|---|
| Jitendex.org 2026-10-03 (CC BY-SA 4.0) | 38.8 MB | 544 MB (514 MiB of banks) | 436,555 terms | 48.7 s (needs `DICT_MAX_UNCOMPRESSED_MB=1000`; rejected at the default 200) |
| Kanjium Pitch Accents, toasted-nutbread "pitch1" (CC BY-SA 4.0, Kanjium) | 1.1 MB | 10 MB | 124,132 pitch rows (2 malformed skipped) | 6.7 s; re-import 7.8 s |

Jitendex occupies 452 MB in `dictionary_terms` (389 MB heap); a lookup of four
expressions is a 0.3 ms bitmap index scan. No frequency list with a clearly
permissive license was found to measure (JPDB/anime/Netflix lists carry no
explicit license); the fixture covers both frequency modes.

## Open

- Images (`img` nodes, `type: "image"` definitions) are dropped; serving them
  needs storage outside the DB and a CSP review.
- Kanji banks and IPA meta are ignored.
- Deinflection rules are not used: lookup is by the tokenizer's lemma.
- The upload runs synchronously in the request; a queue job would suit very
  large files (the CLI already covers them).
