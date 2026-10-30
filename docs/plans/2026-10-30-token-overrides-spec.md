# Per-user token / reading correction (T3.7)

**Date:** 2026-10-30
**Roadmap:** T3.7 in `docs/ROADMAP_ENGENHARIA.md` (Fase 3); input to T3.9 (known-word
model: corrected entries, names excluded)
**Evidence:** `docs/PESQUISA_MERCADO-2026-10-29.md` §2 NEED #3, §4 — every Japanese
pipeline makes the same errors (ー splitting names: マーク → マー|ク; counters split:
10分 → 1|0分, losing じゅっぷん; wrong furigana: 大きく read おうきく; proper nouns
unresolved) and users ask for "a way to correct them manually".
**Status:** Implemented

## Decision

A one-click correction, persisted **per user**, instead of a better parser. The
shared `subtitle_lines.tokens` (catalog-wide, one row per line) and the layer-2
AI cache (`ai_explanations`, per line) are never written: a correction only
changes what *that* user sees and what their stats are keyed by.

## Data: `token_overrides` (migration 0020)

```
token_overrides(user_id uuid → users ON DELETE CASCADE,
                subtitle_line_id uuid → subtitle_lines ON DELETE CASCADE,
                start_idx int, end_idx int,           -- inclusive span of original token indices
                tokens jsonb,                         -- corrected Token[] for that span
                created_at, updated_at)
primary key (user_id, subtitle_line_id, start_idx)
index (subtitle_line_id)                              -- line-delete cascade
check (start_idx >= 0 and end_idx >= start_idx)
```

A **span** (not a single position) is what makes merges (マー + ク → マーク: span
[0,1] → 1 token) and splits (one token → two: span [i,i] → 2 tokens) the same
operation. `tokens` uses the `Token` shape of `subtitle_lines.tokens`
(surface/lemma/reading/romaji/pos/wordEntryId).

## Invariants (`@fuchine/core` `token-overrides.ts`, pure, client-safe)

- `validateTokenOverride(original, o)`: integer span inside the line, ≥1 token,
  non-empty surfaces, and **the corrected surfaces concatenate to exactly the
  original span's surfaces** — the line text can never change.
- `applyTokenOverrides(tokens, overrides)` (strict, throws `TokenOverrideError`)
  and `applyTokenOverridesDetailed(…, { strict })`: overrides sorted by start,
  non-overlapping; also returns `spans` (each corrected token's origin
  `[start, end]` + `corrected`). The read path is **lenient**: an override that
  no longer validates (the line was re-tokenized after it was saved) is skipped,
  so the line degrades to the shared tokens instead of breaking.
- Editor helpers: `mergeTokens`, `splitToken`, `editBlock`/`buildOverrideEdit`
  (an edit always replaces whole correction blocks, so a saved override never
  partly overlaps another), `isNoopOverride`, `toHiragana`, `isHiraganaReading`.

## API: `PUT|DELETE /api/lines/:id/tokens`

Auth (`auth-coverage.test.ts` discovers it), `isUuid` on the id, rate limit
`tokenFix` (120/h per user), same-origin by the CSRF middleware.

- `PUT` body `{ startIdx, endIdx, tokens: [{ surface, lemma?, reading?, pos?, wordEntryId? }] }`
  (≤ 32 tokens, fields ≤ 64 chars). Readings are normalized to hiragana (a
  kana-only surface without one reads as itself; anything else non-kana → 400);
  romaji is recomputed. `wordEntryId` **omitted** = re-resolved with the
  existing `JaDictionary` (`getDictionary(video.language)`: lemma, then surface;
  reading match preferred, else most frequent — the import's rule); **null** =
  "not a dictionary word" (the UI also sets pos `固有名詞`); a given id must
  exist. Existing corrections inside the span are replaced; one that only partly
  overlaps it → 400 ("reset it first"). A correction equal to the original
  tokens is stored as a reset. 400 for every validation error, 404 for an
  unknown line.
- `DELETE` body `{}` = reset the whole line; `{ startIdx, endIdx? }` = reset the
  corrections overlapping that span.
- Both answer with the line as the user now sees it:
  `{ lineId, tokens, tokenSpans | null, wordEntries }`.

## Where corrections apply (one helper)

`apps/web/lib/token-overrides.ts` `withTokenOverrides(db, userId, rows, lineIdOf)`
loads the user's overrides for all the rows' lines in **one query** (chunked at
5000 ids) and swaps `tokens` (+ `tokenSpans` on corrected lines):

| Read path | Function |
|---|---|
| Player payload (page + `GET /api/videos/:id`) | `getVideoWithLines(db, id, { userId })`; the page's known-word coloring reads the corrected `wordEntryId`s |
| Review queue (tokens + the `wordEntries` map, cloze target) | `getReviewQueue` |
| Review stats (`reviews_ok/total` per word) | `reviewCardById` |
| Curation screen | `listUncuratedCards` |
| Lapis export (target word, `Sentence`, `SentenceFurigana`, reading) — also AnkiConnect push, same loader | `getLapisExport` |
| Watch beacon (`views` per word) | `recordProgress` |
| Session summary ("words matured") | `getSessionSummary` |

Clicks need nothing extra: the popup already opens on the corrected entry id.

**Not applied (deliberately):**

- **Past stats are not rewritten.** Views/clicks/reviews recorded before a
  correction stay on the old `wordEntryId`; from the correction on, they go to
  the corrected one. Rewriting history would need per-event line provenance we
  don't keep.
- **Comprehension % / `level_estimate`** read the shared, catalog-wide
  `word_examples` (and the worker's import-time estimate). They stay on the
  shared tokens; T3.9 (token-weighted coverage per user) is where corrections
  join that model.
- **The shared AI explanation cache** stays per line (D3/D8): the explanation is
  of the sentence, not of one user's segmentation.
- The basic Anki TSV export has no token-derived fields.

## UI

The dictionary popup (player focal line and curation card) gets a **Fix** action
(also on tokens without an entry — the player now addresses its popup by token
index, so a name or a split fragment can be opened and fixed). Fix opens
`TokenFixEditor` (`@fuchine/ui`) inside the popup: boundaries (merge with
previous/next, split after a character), reading (hiragana, validated inline),
dictionary entry (keep current / match automatically / search the dictionary /
"Not a dictionary word (name)"), Save, Cancel, and "Corrected by you" + **Reset**
on a corrected token. Buttons, labelled inputs and radios; Escape cancels; key
events don't reach the page shortcuts. Opening Fix pauses the video. Stories:
`UI/TokenFixEditor` (merge, reading fix, counter, corrected, saving, server
error, no search, dark) and `UI/DictPopup` (WithFix, CorrectedByYou,
NoEntryFixable).

## Tests

- Unit: `packages/core/src/token-overrides.test.ts` (ー merge, counter with
  じゅっぷん, reading fix, proper noun → entry, split, invalid surface, overlaps,
  lenient skip, editor helpers), `apps/web/lib/token-overrides.test.ts` (body
  parsing, `correctLine`), `packages/ui/src/components/TokenFix/TokenFixEditor.test.ts`.
- E2E: `apps/web/scripts/e2e-token-overrides.ts` — persistence; player payload,
  review queue, curation page and Lapis export for the same user and not another;
  invalid surface / partial overlap / bad reading / unknown entry rejected;
  stats keyed by the corrected entry; reset (span, no-op save, whole line); line
  and user delete cascade.
