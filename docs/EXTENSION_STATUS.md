# Fuchine Importer — status and known issues

The Fuchine Importer extension captures the captions that the video player in
your browser downloads, then sends them to your Fuchine instance. When the
video site changes how its player fetches captions, capture can break until the
extension is updated. This page lists those breakages. The extension popup
links here ("Known issues").

**If imports stop working:** check the table below first. If your problem isn't
listed, [open an issue](https://github.com/Fuchine/web/issues/new) with the
extension version (shown at the bottom of the popup, `build vX.Y.Z`), your
browser version, the video URL and the message the popup showed.

## Known issues

| Date (UTC) | Symptom | Affected versions | Status |
| ---------- | ------- | ----------------- | ------ |
| —          | No known issues | — | — |

<!--
Maintainers: add newest rows at the top and keep resolved rows for history.
Row template:
| 2026-11-02 | "Turn on Japanese subtitles (CC)…" even with CC on; no lines captured | 0.1.0–0.1.2 | Investigating / Fixed in 0.1.3 / Workaround: … |

Status values: Investigating · Workaround: <what to do> · Fixed in <version>.
Publishing a fix: bump `version` in extension/package.json, tag `ext-vX.Y.Z`,
download the zip from the "Extension" workflow run, upload it to the Chrome
Web Store dashboard, then update the row here.
-->

## Version history

| Version | Date | Notes |
| ------- | ---- | ----- |
| 0.2.0   | 2026-10-31 | Optional **API token** field in the popup (T2.11): when set, imports send `Authorization: Bearer fch_…` without cookies, only to the configured instance. Clear 401 message ("Token invalid or revoked"). Without a token it still uses the session cookie (deprecated). |
| 0.1.0   | 2026-10-30 | Rebuilt with WXT + TypeScript. Renamed listing to "Fuchine Importer"; dropped the `tabs` permission. Adds this "Known issues" link. |
