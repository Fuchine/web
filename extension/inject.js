// Injected into the page MAIN world at document_start (before the YouTube
// player runs). It hooks fetch/XHR and captures timedtext (caption) responses —
// these carry the PO token the player generates, which a plain re-fetch lacks.
// Captured tracks are stashed on window.__fuchine for the popup to read.
(function () {
  if (window.__fuchineHooked) return;
  window.__fuchineHooked = true;
  const store = (window.__fuchine = window.__fuchine || { tracks: [] });

  function capture(url, getText) {
    if (typeof url !== "string" || !url.includes("/api/timedtext")) return;
    getText()
      .then((body) => {
        if (body && body.trim()) store.tracks.push({ url, body, at: Date.now() });
      })
      .catch(() => {});
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      const p = origFetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : input && input.url;
        p.then((res) => capture(url, () => res.clone().text())).catch(() => {});
      } catch (e) {}
      return p;
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (_method, url) {
      this.__fuchineUrl = url;
      return open.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      this.addEventListener("load", function () {
        try {
          const u = this.__fuchineUrl;
          capture(u, () => Promise.resolve(this.responseText || ""));
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  }
})();
