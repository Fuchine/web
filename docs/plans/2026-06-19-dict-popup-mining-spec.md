# Spec — Dictionary popup + Sentence mining confirmation

**Date:** 2026-06-19
**Branch:** `feat/app-shell` (continuation)
**Feature:** F1 player — token dictionary popup (`DictPopup`) and mine-to-review
confirmation (`MinedCard`).
**Design source:** `claude-design/player.jsx` (`DictPopup`, `MinedCard`) +
`claude-design/player.css`.

---

## Goal

Two panels on the immersion player, per the approved design:

1. **DictPopup** — clicking a token in the focal subtitle opens an anchored
   dictionary popup (reading, POS, frequency, dictionary form, glosses) with
   **Explain** and **Save word** actions.
2. **MinedCard** — clicking **Mine sentence** creates a review card and shows a
   confirmation toast with a cloze preview, source, and **Undo** / **View deck**.

Scope: build both components in `@fuchine/ui` (Storybook-validated) **and** wire
them live into the player + APIs.

---

## Components (`@fuchine/ui`, presentational)

### `DictPopup`
Mirrors the design. Props:
- `entry: DictEntry` — combined display data (see below)
- `pos: PopupAnchor | null` — `{ left; bottom; arrowLeft; width }`, computed by the parent from the clicked token's rect
- `saved: boolean`
- `onExplain: () => void`
- `onClose: () => void`
- `onSave?: () => void` — **optional; left unwired for now** (no saved-words table)

Renders: surface + reading (top), POS chip, frequency (5 dots + label),
"Dictionary form" (lemma + reading), numbered glosses, footer with **Explain**
(primary) and **Save word** (disabled when `onSave` is absent). A soft scrim
behind it calls `onClose`.

### `MinedCard`
Mirrors the design. Props:
- `sentence: string` and `clozeTarget: string | null` — the target surface to blank in the sentence (null → no blank, full sentence shown)
- `translation: string | null`
- `target: { surface: string; reading: string | null } | null` — the mined word shown in the card foot
- `sourceLabel: string` — e.g. `"Kyoto Slow Living · 5:24"`
- `onUndo: () => void`
- `onViewDeck: () => void`
- `onClose: () => void`

Renders: check + "Mined to Review · 1 new card · due now", a card preview with
cloze (`毎朝川沿いを［ ＿＿ ］います。`), translation, target word + reading,
source, and **Undo** / **View deck** actions. Soft scrim calls `onClose`.

---

## Data

### DictEntry (popup display)
Combined from **token** (already in the player payload) + **entry** (fetched):
- From token: `surface`, `reading`, `pos` (→ friendly label, e.g. "Verb · te-form"), `lemma`
- From entry (`GET /api/dictionary?id=<wordEntryId>` → `word_entries` row): `definitions[].glosses` (flattened to the numbered list), `frequencyRank` (→ 1–5 bucket via a threshold map), `lemma` + `reading` (the "Dictionary form").

`word_entries` columns confirmed: `{ id, language, lemma, reading, pos, definitions: Definition[], frequencyRank }`.

### Frequency bucket
`frequencyRank` is an absolute rank (1..N, nullable). Map to the design's 5
buckets (Rare/Uncommon/Common/Common/Very common) via fixed thresholds; null →
no dots / no label.

### MinedCard preview
- `clozeTarget` = surface of the **active token** (the last token opened in the popup for the current line). If none was opened, `clozeTarget = null` (sentence shown without a blank — still a valid listening card).
- `sourceLabel` = `video.channel` + formatted line start timestamp.

---

## Player integration

- **`PlayerFocalSubtitles`**: tokens with a `wordEntryId` become clickable
  (`onTokenClick(token, index)`), the active token gets a highlight, and the
  component exposes per-token refs for anchoring. Add a **Mine sentence** button
  next to the existing **Explain** button.
- **`Player.tsx`**: owns state — `activeToken` (token + index), fetched
  `dictEntry` (+ loading), `minedOpen`. New callbacks:
  - `onFetchDictionary?: (wordEntryId: string) => Promise<DictEntryData>` (cached per id)
  - `onMineSentence?: (lineId: string) => Promise<{ created: boolean }>`
  - `onUndoMine?: (lineId: string) => Promise<void>`
  Token click → set active + fetch entry. **Mine sentence** → `onMineSentence(currentLine.id)` then open `MinedCard`. **Explain** in the popup reuses the existing rail-tab switch.
- **`PlayerStage`**: hosts the anchored `DictPopup` + the `MinedCard` overlay
  (it owns `stageRef`); anchoring ported from the design's `useLayoutEffect`
  (token rect vs stage rect, clamped, arrow centered, recomputed on resize).
- **`PlayerView`** (app): wires `onFetchDictionary` → `GET /api/dictionary?id=`,
  `onMineSentence` → `POST /api/cards`, `onUndoMine` → `DELETE /api/cards?id=`.

---

## API

- `GET /api/dictionary?id=` — **exists**, returns `{ entry }`.
- `POST /api/cards` — **exists**, mines a line (sentence-level), returns `{ card, created }`.
- `DELETE /api/cards?id=<cardId>` — **NEW.** Deletes a card owned by the user
  (for Undo). Auth-gated; 404 if not found / not owned. Add `deleteCard` to
  `lib/cards.ts` (testable) and a `DELETE` handler in `app/api/cards/route.ts`.
  The mine response already returns the card id for Undo to target.

---

## CSS

Port the relevant design classes from `claude-design/player.css` into the app's
`apps/web/app/videos/[id]/player.css`: `.dict-pop`, `.dict-arrow`, `.dp-*`,
`.mined-*`, `.cloze`, `.scrim-soft`, `.sent-actions`/`.sent-btn`, and the
clickable/active token states. Reconcile with the existing focal-subtitle class
names (`.focal-subs`, `.jp-tok`).

---

## Decisions

- **Cloze**: visual only; card persisted sentence-level (`cardType` listening).
  No schema change. The Review screen will not show the same blank until a later
  task persists the cloze target (through the ERD process).
- **Save word**: rendered but inert (no saved-words table). `onSave` left
  unwired in the player; button disabled with a "soon" affordance.
- **Undo**: backed by the new `DELETE /api/cards?id=`. Undo removes the
  just-created card and dismisses the toast.

## Out of scope

- Persisting the cloze target / cloze-aware Review rendering.
- A saved-words/vocab table and a working **Save word**.
- Dictionary **search** (the `?q=` path) and the standalone Dictionary screen.

---

## Validation

- Storybook stories for `DictPopup` (resolved entry; saved/unsaved) and
  `MinedCard` (with cloze; no-cloze fallback).
- `pnpm typecheck` green on `@fuchine/ui` and `@fuchine/web`.
- Live: click a token → popup with real dictionary data; **Mine sentence** →
  card created (verify row in `sentence_cards`); **Undo** → row removed.
