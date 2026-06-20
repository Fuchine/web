// Runs on the Fuchine app origin (ISOLATED world). Two jobs:
//   1) Mark the page so the app knows the extension is installed.
//   2) Relay IMPORT requests app→background and IMPORT_RESULT background→app.
(function () {
  const APP_SOURCE = "fuchine-app";
  const EXT_SOURCE = "fuchine-ext";

  // 1) Detection marker.
  try {
    document.documentElement.dataset.fuchineExt = chrome.runtime.getManifest().version;
  } catch (e) {}

  // 2a) App → background.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const m = event.data;
    if (!m || m.source !== APP_SOURCE || m.type !== "IMPORT") return;
    if (typeof m.videoId !== "string") return;
    chrome.runtime.sendMessage({ type: "IMPORT", videoId: m.videoId }).catch(() => {
      // Service worker unreachable (e.g. just restarted) — tell the app fast
      // instead of letting it wait out the full timeout.
      window.postMessage(
        {
          source: EXT_SOURCE,
          type: "IMPORT_RESULT",
          videoId: m.videoId,
          ok: false,
          error: "Extension unavailable — please try again.",
        },
        window.location.origin,
      );
    });
  });

  // 2b) Background → app.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "IMPORT_RESULT") return;
    window.postMessage(
      {
        source: EXT_SOURCE,
        type: "IMPORT_RESULT",
        videoId: msg.videoId,
        ok: msg.ok,
        lines: msg.lines,
        error: msg.error,
        dbVideoId: msg.dbVideoId,
      },
      window.location.origin,
    );
  });
})();
