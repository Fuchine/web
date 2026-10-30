// Injected into the YouTube page MAIN world at document_start (before the
// player runs). It hooks fetch/XHR and captures timedtext (caption) responses —
// these carry the PO token the player generates, which a plain re-fetch lacks.
// Captured tracks are stashed on window.__fuchine for lib/capture.ts to read.
// MAIN world: no extension APIs here, only page globals.
export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_start",
  world: "MAIN",
  // Don't postMessage into YouTube's page on startup (WXT dev signal).
  noScriptStartedPostMessage: true,
  main() {
    const w = window as any;
    if (w.__fuchineHooked) return;
    w.__fuchineHooked = true;
    const store: { tracks: { url: string; body: string; at: number }[] } =
      (w.__fuchine = w.__fuchine || { tracks: [] });

    function capture(url: unknown, getText: () => Promise<string>) {
      if (typeof url !== "string" || !url.includes("/api/timedtext")) return;
      getText()
        .then((body) => {
          if (body && body.trim()) store.tracks.push({ url, body, at: Date.now() });
        })
        .catch(() => {});
    }

    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (this: unknown, input: RequestInfo | URL) {
        const p = origFetch.apply(this, arguments as unknown as Parameters<typeof fetch>);
        try {
          const url = typeof input === "string" ? input : input && (input as Request).url;
          p.then((res) => capture(url, () => res.clone().text())).catch(() => {});
        } catch (e) {}
        return p;
      } as typeof fetch;
    }

    const XHR = window.XMLHttpRequest;
    if (XHR) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (this: any, _method: string, url: string | URL) {
        this.__fuchineUrl = url;
        return (open as any).apply(this, arguments);
      } as typeof open;
      XHR.prototype.send = function (this: any) {
        this.addEventListener("load", function (this: any) {
          try {
            const u = this.__fuchineUrl;
            capture(u, () => Promise.resolve(this.responseText || ""));
          } catch (e) {}
        });
        return (send as any).apply(this, arguments);
      } as typeof send;
    }
  },
});
