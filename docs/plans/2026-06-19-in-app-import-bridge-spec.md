# In-app import via extension bridge

**Date:** 2026-06-19
**Issue:** [#8](https://github.com/Fuchine/web/issues/8) — Import button does not import subtitles
**Status:** Design approved, pending spec review

## Goal

Let a user import a YouTube video **from inside the Fuchine app** (`/import`),
instead of having to leave for YouTube and click the extension popup manually.
The user pastes a URL, clicks Import, and ends up on the player with subtitles —
without operating anything outside the app.

## Constraint (why the obvious approaches don't work)

YouTube gates the caption content endpoint (`/timedtext`): the spike in
`tools/spike/` proved it returns **0 bytes** outside a real, authenticated
browser session — the player must fetch the track with a PO token it generates
in the youtube.com page context. Therefore:

- **Server-side fetch** when the user pastes a URL is blocked (locked decision
  in CLAUDE.md: server-side is fallback only).
- **Embedding the YouTube IFrame player in the modal** does NOT help: the iframe
  is cross-origin (youtube.com), so the Fuchine page cannot read its
  `ytInitialPlayerResponse` or network requests (same-origin policy).

The capturer must be the **extension**, running on youtube.com. What we build is
a bridge so the experience *feels* in-app: the app triggers the import, the
extension does the capture in a YouTube tab, and the app navigates to the player
when it's done.

## Architecture

Three contexts that can't see each other directly are coordinated by the
extension's service worker:

```
App (/import)                Extension (MV3)                 YouTube tab
  paste URL, Import   ──post──▶ bridge.js (app origin)
  read data-fuchine-ext        └─ chrome.runtime ──▶ background.js
                                                       └─ tabs.create(watch?v=ID&fuchine_import=1) ──▶ yt-auto.js
                                                                                                        enable CC,
                                                                                                        capture track,
                                                                                                        POST /api/import
  navigate /videos/:id ◀─post── bridge.js ◀── background.js ◀──── IMPORT_RESULT ◀──────────────────────┘
```

### Communication contract

- **Detection:** the app-origin content script sets
  `document.documentElement.dataset.fuchineExt = "<manifest version>"` at
  `document_start`. The app reads it to know the extension is installed.
- **App → extension:** `window.postMessage({ source: "fuchine-app", type:
  "IMPORT", videoId })`, caught by `bridge.js` (validates `event.origin`), which
  relays via `chrome.runtime.sendMessage`. (Web pages cannot call
  `chrome.runtime` directly; a content-script bridge is the standard MV3
  pattern.)
- **Extension → app:** `bridge.js` posts back `{ source: "fuchine-ext", type:
  "IMPORT_RESULT", videoId, ok, lines?, error? }`.
- **Capture + POST:** done by the YouTube tab (it has the captions + the session
  cookie), reusing the existing `extractCaptions`. No server-side fetch.
- **No extension installed:** the modal falls back to an install CTA
  (`/extension`) plus a manual "Open on YouTube" path.

The YouTube tab is opened **visible** (not a hidden background tab): visible is
where capture is reliable. The tab auto-captures and signals done; the user just
sees it open and close.

## Components

### Extension (`extension/`)

**`manifest.json`** (0.0.5 → 0.0.6)
- New content script on the Fuchine origin (`http://localhost:3000/*`, plus a
  documented placeholder for production), world ISOLATED, `run_at:
  document_start` → `bridge.js`.
- Add `background.service_worker: "background.js"`.
- New content script on youtube.com (ISOLATED) → `yt-auto.js`.
- `host_permissions` already covers localhost.

**`bridge.js`** (new — runs on the app page)
- `document_start`: set `document.documentElement.dataset.fuchineExt =
  chrome.runtime.getManifest().version`.
- Listen for `window.postMessage` `{ source: "fuchine-app", type: "IMPORT",
  videoId }` (validate origin); relay via `chrome.runtime.sendMessage`.
- Listen for `chrome.runtime.onMessage` results; `window.postMessage` them back
  to the app.

**`background.js`** (new — service worker, the glue)
- On `IMPORT`: `chrome.tabs.create({ url:
  "https://www.youtube.com/watch?v=<id>&fuchine_import=1" })`.
- Track `{ videoId → appTabId }` to route the result back.
- On `IMPORT_RESULT` from the YouTube tab: relay to the app tab's `bridge.js`
  and close the YouTube tab.

**`yt-auto.js`** (new — runs on youtube.com, ISOLATED)
- Acts **only when** the URL has `fuchine_import=1`.
- Enable CC via the player API; poll `window.__fuchine.tracks` (populated by the
  existing `inject.js`); build the payload; `POST /api/import` with
  `credentials: "include"`.
- Send `IMPORT_RESULT` to the background. On timeout / no-JA / error, send an
  error result.

**`capture.js`** (new — shared module)
- Extract `extractCaptions` + parsing (currently inlined in `popup.js`) into a
  module shared by `popup.js` and `yt-auto.js`, to avoid duplication.

### App (`apps/web`)

**`lib/extension-bridge.ts`** (new — client helper, unit-testable)
- `isExtensionInstalled(): boolean` — reads `data-fuchineExt`.
- `requestImport(videoId): Promise<{ ok, lines?, error? }>` — posts the message
  and resolves on the matching `IMPORT_RESULT`, with a timeout. The
  message-matching + timeout logic is pure and tested in isolation.

**`ImportModal.tsx`** — replace the fake `handleStartStudy`:
- `valid` state: if the extension is present → "Import & study" runs
  `requestImport` → **real** `processing` state tied to the round-trip →
  success navigates to `/videos/:id`; if absent → install CTA.
- `processing` / `done` / `failed` reflect the real result (no `setTimeout`
  simulation).
- Keep "Open on YouTube" as a manual fallback. Adjust copy.

**`/extension` page** (new) — install instructions (the current link 404s).
Adapt `extension/README.md` content for the UI.

## Error handling

- **Extension absent:** detected via the missing marker → modal shows install
  CTA, never attempts the bridge.
- **No Japanese captions / `needs-cc` timeout:** `yt-auto.js` returns an error
  result → modal shows a clear message ("No Japanese subtitles", or "Couldn't
  capture — try opening on YouTube").
- **Not signed in (401 from `/api/import`):** surfaced as an error result asking
  the user to sign in.
- **Bridge timeout** (extension present but no result in N seconds): modal
  surfaces a retry + manual fallback.

## Testing / verification

- **Unit (vitest, apps/web):** `extension-bridge` — message matching, timeout,
  detection via the dataset marker.
- **Runtime (manual, real Chrome):** load the unpacked extension, trigger import
  from `/import` → a YouTube tab opens, captures, POSTs, the modal advances and
  navigates to the player. Same evidence-capture approach used for the other
  fixes.

## Out of scope (YAGNI)

- Hidden/background YouTube tab capture (fragile; revisit if the visible tab is
  annoying).
- Production auth hardening for the cross-origin cookie (tracked separately in
  `extension/README.md`).
- WXT migration of the extension (planned for Phase 2).
- Server-side caption fetch (locked as fallback only).
```
