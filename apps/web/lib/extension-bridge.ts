// Bridges the web app to the Fuchine browser extension. The extension's
// content script sets a DOM marker (detection) and relays an IMPORT request to
// its service worker, which captures captions in a YouTube tab and POSTs them.

export const APP_SOURCE = "fuchine-app";
export const EXT_SOURCE = "fuchine-ext";
const EXT_FLAG = "fuchineExt"; // document.documentElement.dataset.fuchineExt

export interface ImportResult {
  ok: boolean;
  lines?: number;
  error?: string;
}

/** Pure: normalize an incoming postMessage into our IMPORT_RESULT, or null. */
export function parseImportResult(data: unknown, videoId: string): ImportResult | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.source !== EXT_SOURCE || m.type !== "IMPORT_RESULT") return null;
  if (m.videoId !== videoId) return null;
  return {
    ok: m.ok === true,
    lines: typeof m.lines === "number" ? m.lines : undefined,
    error: typeof m.error === "string" ? m.error : undefined,
  };
}

/** True when the extension injected its marker on this page. */
export function isExtensionInstalled(): boolean {
  return (
    typeof document !== "undefined" &&
    !!document.documentElement.dataset[EXT_FLAG]
  );
}

/** Ask the extension to import a video; resolves with the result (or a timeout). */
export function requestImport(videoId: string, timeoutMs = 90_000): Promise<ImportResult> {
  return new Promise((resolve) => {
    function cleanup() {
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
    }
    const onMsg = (e: MessageEvent) => {
      // Only trust messages our own bridge.js posts (same window, same origin) —
      // otherwise any same-page script could spoof a successful import.
      if (e.source !== window || e.origin !== window.location.origin) return;
      const r = parseImportResult(e.data, videoId);
      if (!r) return;
      cleanup();
      resolve(r);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: "Timed out waiting for the extension. Try opening on YouTube." });
    }, timeoutMs);
    window.addEventListener("message", onMsg);
    window.postMessage({ source: APP_SOURCE, type: "IMPORT", videoId }, window.location.origin);
  });
}
