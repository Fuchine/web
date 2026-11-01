// Popup logic. Captions are obtained from the YouTube tab in two ways:
//   1) Intercepted — inject.content.ts captured the player's own timedtext
//      response (carries the PO token). This is the reliable path; needs CC to
//      have been turned on so the player fetched the track.
//   2) Re-fetch — read the track baseUrl from ytInitialPlayerResponse and fetch
//      it. Often gated (empty), kept as a fallback.
// The result is POSTed to the Fuchine import API with the API token
// (`Authorization: Bearer`) when one is set, else with the session cookie.
import { extractCaptions } from "@/lib/capture";
import {
  isYouTubeWatchUrl,
  STATUS_URL,
  importRequestInit,
  isApiTokenFormat,
  normalizeBase,
  normalizeToken,
  originPattern,
  tokenForOrigin,
  unauthorizedMessage,
} from "@/lib/instance";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const setStatus = (msg: string) => {
  $("status").textContent = msg;
};

async function getBase(): Promise<string> {
  const { base } = (await browser.storage.local.get("base")) as { base?: string };
  return normalizeBase(base);
}

/** The stored token for `base`, or null (never logged or echoed in full). */
async function getToken(base: string): Promise<string | null> {
  const stored = (await browser.storage.local.get(["base", "apiToken"])) as {
    base?: string;
    apiToken?: string;
  };
  return tokenForOrigin(stored, base);
}

/**
 * Ensure the extension holds the host permission for `base` so the credentialed
 * POST (and the in-app bridge) can reach a published instance. localhost is in
 * the static manifest, so dev never prompts; other origins are requested here,
 * from the import click (a user gesture — required by permissions.request).
 * On grant, ask the background to register the bridge content script for it.
 */
async function ensureHostPermission(base: string): Promise<boolean> {
  const pattern = originPattern(base);
  if (!pattern) return true; // let the fetch surface a clearer error
  if (await browser.permissions.contains({ origins: [pattern] })) return true;
  const granted = await browser.permissions.request({ origins: [pattern] });
  if (granted) {
    browser.runtime
      .sendMessage({ type: "REGISTER_BRIDGE", origin: new URL(base).origin })
      .catch(() => {});
  }
  return granted;
}

async function doImport() {
  const btn = $<HTMLButtonElement>("import");
  btn.disabled = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null || !isYouTubeWatchUrl(tab.url)) {
      setStatus("Open a YouTube video first.");
      return;
    }

    // Request the instance host permission FIRST, before the (potentially slow)
    // caption capture. permissions.request needs a live user gesture, and the
    // click's transient activation can lapse across the capture awaits.
    const base = await getBase();
    if (!(await ensureHostPermission(base))) {
      setStatus(`Permission to reach ${base} was denied — grant it to import there.`);
      return;
    }

    setStatus("Reading captions…");
    const [{ result } = {} as { result?: unknown }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: extractCaptions,
    });
    const cap = result as Awaited<ReturnType<typeof extractCaptions>> | undefined;

    if (!cap) { setStatus("No result from the page."); return; }
    if ("error" in cap) {
      if (cap.error === "no-ja") {
        setStatus(`No Japanese captions on this video.${cap.langs?.length ? ` (has: ${cap.langs.join(", ")})` : ""}`);
        return;
      }
      if (cap.error === "needs-cc") {
        setStatus("Turn on Japanese subtitles (CC) in the player, let it play ~2s, then click Import again.");
        return;
      }
      setStatus(`Could not read captions: ${cap.error}`);
      return;
    }
    if (!cap.captions || cap.captions.length === 0) {
      setStatus("Caption track found but no lines were returned.");
      return;
    }

    setStatus(`Captured ${cap.captions.length} lines (${cap.source}). Sending to ${base}…`);
    const token = await getToken(base);
    let res: Response;
    try {
      res = await fetch(`${base}/api/import`, importRequestInit(cap, token));
    } catch (netErr: any) {
      setStatus(
        `Captured ${cap.captions.length} lines (${cap.source}) ✓\n` +
        `But couldn't reach Fuchine at ${base} — is the web app running there? ` +
        `(${netErr && netErr.message ? netErr.message : netErr})`,
      );
      return;
    }

    if (res.status === 401) {
      setStatus(unauthorizedMessage(token !== null));
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(`Import failed (${res.status}): ${body.error || ""}`); return; }
    setStatus(body.cached ? "Already imported ✓ Open Fuchine to study." : `Added to Fuchine ✓ (${body.lines} lines)`);
  } catch (err: any) {
    setStatus(`Error: ${err && err.message ? err.message : err}`);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  // Single source of truth for the version: package.json → manifest.json.
  $("version").textContent = `build v${browser.runtime.getManifest().version}`;

  const statusLink = $<HTMLAnchorElement>("status-link");
  statusLink.href = STATUS_URL;
  statusLink.addEventListener("click", (e) => {
    e.preventDefault();
    browser.tabs.create({ url: STATUS_URL }).catch(() => {});
    window.close();
  });

  const input = $<HTMLInputElement>("base");
  input.value = await getBase();
  input.addEventListener("change", async () => {
    const base = input.value.trim();
    browser.storage.local.set({ base });
    // If we already hold the permission for this instance, (re)register the
    // in-app bridge so the "import from the app" button works there too. The
    // permission itself is requested on the first import (needs a click gesture).
    const pattern = originPattern(base);
    if (pattern && (await browser.permissions.contains({ origins: [pattern] }).catch(() => false))) {
      browser.runtime.sendMessage({ type: "REGISTER_BRIDGE", origin: new URL(base).origin }).catch(() => {});
    }
  });

  // API token: write-only from the UI's point of view. The hint shows a short
  // prefix of the saved token, never the token itself.
  const tokenInput = $<HTMLInputElement>("token");
  const tokenHint = $("token-hint");
  const showTokenHint = async () => {
    const { apiToken } = (await browser.storage.local.get("apiToken")) as { apiToken?: string };
    tokenHint.textContent = apiToken
      ? `Saved (${apiToken.slice(0, 8)}…). Paste a new one to replace it, or clear the field to remove it.`
      : "Optional. Create one in Fuchine → Settings → Extension & API.";
  };
  await showTokenHint();
  tokenInput.addEventListener("change", async () => {
    const value = normalizeToken(tokenInput.value);
    if (!value) {
      await browser.storage.local.remove("apiToken");
      setStatus("API token removed. Imports will use your Fuchine sign-in.");
    } else if (!isApiTokenFormat(value)) {
      setStatus("That doesn't look like a Fuchine API token (it starts with fch_).");
      return;
    } else {
      await browser.storage.local.set({ apiToken: value });
      setStatus("API token saved.");
    }
    tokenInput.value = "";
    await showTokenHint();
  });

  $("import").addEventListener("click", doImport);
}

// Module scripts run after parsing, so the DOM is ready here.
init();
