# Browser extension (Fuchine Importer)

The extension is how videos get into Fuchine. YouTube gates caption content
outside a real browser session: the caption endpoint returns nothing without a
token the player generates in the page. So instead of fetching captions from the
server, the extension runs in your browser, captures the Japanese captions the
YouTube player itself downloads, and sends them to your Fuchine instance.

Source: [`extension/`](../extension/) (Manifest V3, no build step). Developer
notes on its internals are in [`extension/README.md`](../extension/README.md).

## Install

There is no store listing yet (Chrome Web Store publishing is roadmap task
T2.10), so load it unpacked:

1. Get the repository (clone it, or download and unzip it).
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on
   **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin **Fuchine Importer** to the toolbar. The popup shows its version
   (`build v…`, from `manifest.json`).

Supported browsers: Chromium-based browsers, Chrome/Edge **111 or newer**.
Firefox is not supported.

To update, pull the repository and click the reload icon on the extension's card
in `chrome://extensions`.

## Point it at your instance

1. Open the popup and set **Fuchine URL** to your instance, e.g.
   `https://fuchine.example.com` (default: `http://localhost:3000` for
   development).
2. **Create an API token** (recommended, extension 0.2.0+): in Fuchine, open
   **Settings → Extension & API → API tokens**, type a name (e.g. "Laptop
   Chrome") and click **Create token**. The token (`fch_…`) is shown **once**:
   click **Copy**, then paste it into the popup's **API token** field. The popup
   confirms "API token saved." and from then on shows only its first characters.
3. The first time you import to a non-localhost instance, Chrome asks for
   permission to access that site. Accept it: it lets the extension send the
   import and enables the in-app bridge on that site.

With a token, each import carries `Authorization: Bearer fch_…` and no cookies,
so it works regardless of browser cookie policies (`SameSite`, third-party
cookie blocking). A token can only **import videos**: it cannot read your cards,
change settings or create other tokens. You can have up to 10 active tokens;
the list in Settings shows when each was created and last used. Revoke a token
there if a device is lost; the extension then reports "Token invalid or
revoked". The token is sent only to the instance it was saved for.

Without a token, the extension falls back to your Fuchine **session cookie**
(sign in to the instance in the same browser profile). That path is deprecated;
see [Deprecations](#deprecations).

## Two ways to import

The video must have **Japanese captions**, manual or auto-generated (manual
tracks are preferred when both exist).

**From YouTube (popup).**

1. Open the video on youtube.com.
2. Turn **CC on** and select Japanese, and let it play a couple of seconds so the
   player downloads the track.
3. Click the Fuchine icon, then **Import to Fuchine**.
4. The popup reports `Added to Fuchine ✓ (N lines)`, or `Already imported ✓` if
   the video is already in the library.

**From the app (in-app bridge).**

1. In Fuchine, open **Import** and paste a YouTube URL.
2. The app detects the extension and hands it the video. The extension opens
   the video in a background tab, mutes it, starts playback, turns Japanese
   captions on, captures them, imports, closes the tab, and tells the app, which
   then opens the player.

If the app says the extension is missing on a non-localhost instance, open the
popup, make sure **Fuchine URL** matches the site exactly, and do one popup
import there to grant the permission.

## Permissions

| Permission | Why |
|---|---|
| `https://www.youtube.com/*`, `https://*.youtube.com/*` | Run the caption capture on YouTube pages. |
| `http://localhost:3000/*` | The default development instance. |
| `https://*/*` (optional) | Requested at runtime for **your** instance only, the first time you import there. Never granted wholesale. |
| `activeTab`, `scripting` | Read the current video and its captured captions from the YouTube tab. |
| `tabs` | Open and close the background YouTube tab used by the in-app bridge. |
| `storage` | Remember the Fuchine URL and, if set, the API token. |

## Privacy

- **What it captures.** On YouTube pages, a small script watches the requests
  the player makes and keeps caption (timedtext) responses in that page's memory.
  Nothing leaves the page until you import.
- **What it sends.** On import, one request to **your** instance's
  `/api/import` with the video URL, title, channel, duration, language and the
  Japanese caption lines (text and timestamps). Nothing is sent to anyone else.
- **What it stores.** The instance URL and, if you set one, the API token, in
  the extension's local storage (`chrome.storage.local`). The token is never
  logged or shown back in full; clearing the field removes it.
- **Never media.** The extension never downloads, records or uploads video or
  audio, and Fuchine never stores any. Clips in the app and in reviews play
  through YouTube's official embedded player.
- It does not read your YouTube or Google cookies, history or account data. The
  import request carries your **Fuchine** API token (or, without one, your
  Fuchine session cookie) so the instance knows who imported.
- The in-app bridge only accepts plain 11-character YouTube video ids from the
  Fuchine page, and runs only on the instance you granted.

## Known limitations

- **Unpacked install only** until T2.10 (WXT migration + Chrome Web Store).
- **Live `https://` run pending.** Token and cookie imports are validated on
  localhost; a full run against a live `https://` instance is still pending (it
  is in the deploy smoke test).
- **One instance at a time.** The extension talks to the single URL set in the
  popup; the in-app bridge is registered for that origin only.
- **Depends on YouTube's player.** Capture works by observing how the player
  fetches captions. If YouTube changes that, capture breaks until the extension
  is updated.
- **Captions required.** Videos without a Japanese track cannot be imported
  (there is no transcription yet).
- Very long imports above the 2 MB request cap are rejected (`413`); a typical
  3-hour video is about 0.5 MB.

## Troubleshooting

| Popup message | What to do |
|---|---|
| "Open a YouTube video first." | The active tab must be a `youtube.com/watch` page. |
| "Turn on Japanese subtitles (CC) in the player, let it play ~2s, then click Import again." | The player has not downloaded the Japanese track yet. |
| "No Japanese captions on this video. (has: …)" | The video has no Japanese track; it cannot be imported. |
| "Token invalid or revoked. …" | The saved API token was revoked or mistyped. Create a new one in **Settings → Extension & API** and paste it into the popup. |
| "Sign in to Fuchine first, or paste an API token …" | No token is set and there is no session: create a token (recommended) or sign in to the instance in this browser profile. |
| "That doesn't look like a Fuchine API token" | Paste the whole token, starting with `fch_`. |
| "couldn't reach Fuchine at …" | Wrong **Fuchine URL**, or the instance is down (check `/api/health`). |
| "Permission to reach … was denied" | Import again and accept the permission prompt, or grant site access in `chrome://extensions` → Details. |
| "Import failed (403/429/…)" | The instance refused it: not allowed, rate-limited, or an invalid payload. The message after the code comes from the server. |

## Deprecations

- **Cookie-authenticated import (extension < 0.2.0, or 0.2.0 without a
  token).** `POST /api/import` still accepts the session cookie from a browser
  extension origin (`chrome-extension://…`), exempt from the cross-site check
  only for that case. It will be removed once 0.2.0 is the oldest supported
  extension version (planned with the first Web Store release, T2.10); after
  that, the extension needs an API token. A cross-site *web page* can no longer
  use this path (since T2.11). Same-origin cookie requests are unaffected.
