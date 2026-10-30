# Fuchine Importer (browser extension)

The primary ingestion path. The captions spike (`tools/spike`) showed that
YouTube gates caption content server-side: the `timedtext` endpoint returns
0 bytes without the PO token the player generates in a real browser session.
The extension runs in your logged-in browser, captures the captions the YouTube
player itself downloads, and submits them to the Fuchine import API.

MV3 with **no build step** — load the folder directly. The version shown in the
popup is read from `manifest.json`. Migrating to WXT and publishing to the Chrome
Web Store is roadmap task T2.10 (`docs/ROADMAP_ENGENHARIA.md`).

## Load it (Chrome / Edge)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Run the Fuchine web app (`pnpm dev`) and **sign in** at `http://localhost:3000`.
4. Import a video in either of the two ways below.

Set a different instance URL in the popup's "Fuchine URL" field (defaults to
`http://localhost:3000`). For a non-localhost instance the extension asks for
permission to reach that origin the first time you import — no manual
`manifest.json` edit. Granting it also enables the in-app bridge on that
instance.

## Two ways to import

**From YouTube (popup).** Open a video with Japanese captions, turn CC on so the
player fetches the track, click the Fuchine icon, then **Import to Fuchine**.

**From the app (bridge).** On the app's import screen, paste a YouTube URL. The
app detects the extension (`bridge.js` marks the page), sends the request to the
extension, and the extension opens the video in a background tab, turns the
Japanese captions on, captures them, imports, closes the tab and reports back so
the app can open the player.

## How it works

- `inject.js` runs in the YouTube page's **MAIN world** at `document_start` and
  hooks `fetch`/XHR. When the player downloads a `timedtext` track (with its PO
  token), the response is stored on `window.__fuchine`.
- `capture.js` (shared by the popup and the service worker) reads the current
  video from the player API, which stays correct across YouTube's in-app
  navigation, and picks the captured Japanese track for **that** video id
  (manual preferred over auto/ASR). Re-fetching the track's `baseUrl` from
  `ytInitialPlayerResponse` is only a fallback, used when that response belongs
  to the current video, and is usually gated. It builds
  `{ url, title, channel, durationS, language, captions[] }`.
- `popup.js` POSTs that to `POST /api/import` with `credentials: "include"`, so
  the Auth.js session cookie authenticates the user.
- `bridge.js` runs on the Fuchine app origin (ISOLATED world) and relays
  `IMPORT` / `IMPORT_RESULT` messages between the page and `background.js`, the
  service worker that drives the background-tab import. It only accepts bare
  11-character YouTube video ids.

Capture was validated in a real browser: re-fetching the track from the server
returned 0 bytes, while intercepting the player's own request captured all 55
lines of a manual Japanese track.

## Known limitations / TODO

- **Auth cookie:** cross-origin `credentials: "include"` relies on the Auth.js
  session cookie being sent from the extension to the instance. It works on
  localhost; a per-user API token (`Authorization: Bearer`) is planned in T2.11
  so the extension stops depending on `SameSite` behavior.
- **Live https instance:** the full loop (extension → `https://<domain>`) is
  still to be run against a live instance; it is in the smoke test of
  `docs/DEPLOY_CHECKLIST.md` §6.
- **Platform breakage:** interception depends on how the YouTube player fetches
  captions. If YouTube changes that, capture breaks. A status page for known
  breakages is part of T2.10.
