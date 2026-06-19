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
App (/import)              Extension (MV3)                          YouTube tab
 paste URL, Import ─post─▶ bridge.js (app origin)
 read data-fuchineExt       └─ chrome.runtime ─▶ background.js (service worker)
                                                  1. tabs.create(watch?v=ID)        ─▶ inject.js (MAIN,
                                                  2. executeScript(MAIN): enable CC      already captures
                                                  3. executeScript(MAIN): extractCaptions  timedtext → __fuchine)
                                                  4. POST /api/import (background fetch)
 navigate /videos/:id ◀─post─ bridge.js ◀─runtime─ background.js   5. close tab, return result
```

The background **orchestrates capture via `chrome.scripting.executeScript`** —
the same proven mechanism `popup.js` uses today — instead of a youtube-side
auto-capture script. This avoids MAIN↔ISOLATED message hops (the captured track
lives on `window.__fuchine` in the MAIN world) and reuses `extractCaptions`
verbatim.

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
- **Capture + POST:** the background opens a YouTube tab, enables CC and runs
  `extractCaptions` in its MAIN world via `executeScript`, then POSTs the result
  to `/api/import` with the session cookie. No server-side caption fetch.
- **No extension installed:** the modal falls back to an install CTA
  (`/extension`) plus a manual "Open on YouTube" path.

The YouTube tab is opened **visible** (not a hidden background tab): visible is
where capture is reliable. The tab is closed once capture succeeds; the user
just sees it open and close.

## Components

### Extension (`extension/`)

**`manifest.json`** (0.0.5 → 0.0.6)
- New content script on the Fuchine origin (`http://localhost:3000/*`, plus a
  documented placeholder for production), world ISOLATED, `run_at:
  document_start` → `bridge.js`.
- Add `background.service_worker: "background.js"`.
- Add the `"tabs"` permission (for `chrome.tabs.create`/`remove`).
- `host_permissions` already covers localhost + youtube.

**`capture.js`** (new — shared, no-build module)
- Extract `extractCaptions` + parsing (currently inlined in `popup.js`) plus a
  small `enableCaptions` helper into a classic script defining globals.
- Loaded by the popup via `<script src="capture.js">` before `popup.js`, and by
  the service worker via `importScripts("capture.js")`. Both pass
  `func: extractCaptions` / `func: enableCaptions` to `executeScript`.

**`popup.js`** (modify) — use `capture.js` instead of its inlined copy; behavior
unchanged.

**`bridge.js`** (new — runs on the app page, ISOLATED)
- `document_start`: set `document.documentElement.dataset.fuchineExt =
  chrome.runtime.getManifest().version`.
- Listen for `window.postMessage` `{ source: "fuchine-app", type: "IMPORT",
  videoId }` (validate origin); relay via `chrome.runtime.sendMessage`.
- Listen for `chrome.runtime.onMessage` results; `window.postMessage` them back
  to the app.

**`background.js`** (new — service worker, the orchestrator)
- `importScripts("capture.js")`.
- On `IMPORT { videoId }` from `bridge.js`: remember the sender's `tab.id`, then
  `chrome.tabs.create({ url: "https://www.youtube.com/watch?v=<id>" })`.
- After the YouTube tab loads: `executeScript(MAIN, enableCaptions)`, wait ~2.5s
  for the player to fetch the track, then `executeScript(MAIN, extractCaptions)`.
- POST the captured payload to `<base>/api/import` (`credentials: "include"`);
  build `{ ok, lines?, error? }`.
- `chrome.tabs.sendMessage` the result to the originating app tab, then
  `chrome.tabs.remove` the YouTube tab.
- On no-JA / needs-cc / 401 / timeout → an error result with a clear message.

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
