# Fuchine Importer (browser extension)

The primary ingestion path (the captions spike showed server-side caption
content is gated — see `tools/spike`). The extension runs in your logged-in
browser, where the YouTube player downloads captions normally, and submits them
to the Fuchine import API.

This is an MV3 skeleton with **no build step** — load it directly. When it grows
(Phase 2) we'll migrate to WXT, as the architecture plans.

## Load it (Chrome / Edge)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Run the Fuchine web app (`pnpm dev`) and **sign in** at `http://localhost:3000`.
4. Open a YouTube video that has Japanese captions, click the Fuchine icon,
   then **Import to Fuchine**.

Set a different instance URL in the popup's "Fuchine URL" field (defaults to
`http://localhost:3000`). For a non-localhost instance the extension asks for
permission to reach that origin the first time you import — no manual
`manifest.json` edit. Granting it also enables the in-app "import" bridge on
that instance.

## How it works

- `popup.js` injects `extractCaptions` into the page's **MAIN world**, reads
  `ytInitialPlayerResponse`, picks the Japanese track (manual preferred over
  auto), downloads it as `json3` with the page's credentials, and builds
  `{ url, title, channel, durationS, language, captions[] }`.
- It POSTs that to `POST /api/import` with `credentials: "include"` so the
  Auth.js session cookie authenticates the user.

## Known limitations / TODO

- **Auth cookie:** cross-origin `credentials: "include"` relies on the Auth.js
  session cookie being sent from the extension to the instance. On localhost
  this generally works; for production a token-based auth may be needed (verify
  SameSite behavior).
- **Caption source:** reads `window.ytInitialPlayerResponse`. On SPA navigations
  this can be stale; a more robust version intercepts the player's own caption
  request. Manual JP captions are preferred; falls back to auto (ASR).
- Not yet tested end-to-end in a browser (needs a real Chrome + a signed-in
  instance). The web side (`/api/import`) is covered by integration tests.
