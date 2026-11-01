# Fuchine Importer (browser extension)

The primary ingestion path. The captions spike (`tools/spike`) showed that
YouTube gates caption content server-side: the `timedtext` endpoint returns
0 bytes without the PO token the player generates in a real browser session.
The extension runs in your logged-in browser, captures the captions the YouTube
player itself downloads, and submits them to the Fuchine import API.

Built with [WXT](https://wxt.dev) + TypeScript (MV3, Chrome). It lives outside
the pnpm workspace and has its own `package.json` / `package-lock.json` — use
`npm` here, not `pnpm`.

```sh
cd extension
npm ci            # also runs `wxt prepare` (generates .wxt/ types)
npm run dev       # dev build with reload, opens a browser profile
npm run build     # production build → .output/chrome-mv3/
npm run zip       # release zip   → .output/fuchine-importer-<version>-chrome.zip
npm test          # vitest (lib/*.test.ts)
npm run typecheck
```

The **version** lives in `package.json` (WXT writes it into the manifest); the
popup and the in-app marker read it at runtime from the manifest.

## Load it (Chrome / Edge)

1. `npm run build`.
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `extension/.output/chrome-mv3/` (or unzip a
   release zip and select that folder).
4. Run the Fuchine web app (`pnpm dev`) and **sign in** at `http://localhost:3000`.
5. Import a video in either of the two ways below.

Set a different instance URL in the popup's "Fuchine URL" field (defaults to
`http://localhost:3000`). For a non-localhost instance the extension asks for
permission to reach that origin the first time you import — no manual
manifest edit. Granting it also enables the in-app bridge on that instance.

## Two ways to import

**From YouTube (popup).** Open a video with Japanese captions, turn CC on so the
player fetches the track, click the Fuchine icon, then **Import to Fuchine**.

**From the app (bridge).** On the app's import screen, paste a YouTube URL. The
app detects the extension (the bridge marks the page), sends the request to the
extension, and the extension opens the video in a background tab, turns the
Japanese captions on, captures them, imports, closes the tab and reports back so
the app can open the player.

## Layout

| File | Built as | Role |
| ---- | -------- | ---- |
| `entrypoints/inject.content.ts` | `content-scripts/inject.js` | YouTube page, **MAIN world**, `document_start`. Hooks `fetch`/XHR; when the player downloads a `timedtext` track (with its PO token) the response is stored on `window.__fuchine`. |
| `lib/capture.ts` | (bundled) | `extractCaptions` / `primeCapture`, passed to `scripting.executeScript` in the MAIN world. Reads the current video from the player API (correct across YouTube's in-app navigation), picks the captured Japanese track for **that** video id (manual over ASR), falls back to re-fetching the `baseUrl` (usually gated). Builds `{ url, title, channel, durationS, language, captions[] }`. These functions are serialized into the page, so they must stay self-contained — the tests re-evaluate them from source to enforce it. |
| `entrypoints/popup/` | `popup.html` | POSTs the capture to `POST /api/import` with `credentials: "include"` (Auth.js session cookie). Requests the instance host permission on the import click. "Known issues" link. |
| `entrypoints/bridge.content.ts` | `content-scripts/bridge.js` | App origin, ISOLATED world. Sets `data-fuchine-ext` and relays `IMPORT` / `IMPORT_RESULT` (`fuchine-app` / `fuchine-ext`) between the page and the service worker. Static for `http://localhost:3000/*`; registered at runtime for a configured instance once its permission is granted. Contract mirrors `apps/web/lib/extension-bridge.ts`. |
| `entrypoints/background.ts` | `background.js` | Service worker: drives the background-tab import; only accepts bare 11-character video ids; (re)registers the dynamic bridge. |

## Permissions

- `scripting` — run `extractCaptions`/`primeCapture` in the YouTube tab; register the bridge for a configured instance.
- `storage` — remember the instance URL.
- `activeTab` — act on the tab the popup was opened on.
- Host `https://www.youtube.com/*`, `https://*.youtube.com/*` — the interceptor content script and capture.
- Host `http://localhost:3000/*` — dev instance (bridge + import POST).
- Optional host `https://*/*` — a self-hosted instance can be on any https
  origin and match patterns can't name "the user's instance" more narrowly.
  Nothing is granted at install; the popup requests only the single
  configured origin (`https://<instance>/*`) when you first import there.

The `tabs` permission is no longer requested: the YouTube host permission
already exposes the tab URL the popup checks.

## Name

The listing name is "Fuchine Importer", deliberately without "YouTube" — the
Chrome Web Store has removed extensions that use the trademark in their name
(`docs/PESQUISA_MERCADO-2026-10-29.md` §6).

## Known issues page

The popup links to `docs/EXTENSION_STATUS.md` on GitHub. Point it elsewhere at
build time with `WXT_STATUS_URL=https://… npm run build`.

## Releases

Push a tag `ext-vX.Y.Z` (matching `version` in `package.json`) and the
`Extension` workflow (`.github/workflows/extension.yml`) builds, tests and
uploads the Chrome zip as a workflow artifact. PRs touching `extension/**` get
the same build.

## Known limitations / TODO

- **Auth cookie:** cross-origin `credentials: "include"` relies on the Auth.js
  session cookie being sent from the extension to the instance. It works on
  localhost; a per-user API token (`Authorization: Bearer`) is planned in T2.11
  so the extension stops depending on `SameSite` behavior.
- **Live https instance:** the full loop (extension → `https://<domain>`) is
  still to be run against a live instance; it is in the smoke test of
  `docs/DEPLOY_CHECKLIST.md` §6.
- **Platform breakage:** interception depends on how the YouTube player fetches
  captions. If YouTube changes that, capture breaks — breakages are tracked in
  `docs/EXTENSION_STATUS.md`.
- **Icons:** no icon set yet (the Web Store needs at least a 128×128 PNG). Put
  `16.png`, `32.png`, `48.png`, `128.png` in `public/icon/` and WXT adds them
  to the manifest.
