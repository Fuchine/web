# In-app Import via Extension Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import a YouTube video from inside `/import` — paste URL, click Import, land on the player with subtitles — by having the extension capture captions in a YouTube tab on the app's behalf.

**Architecture:** The app posts an `IMPORT` message; a content script (`bridge.js`) on the Fuchine origin relays it to the extension service worker (`background.js`), which opens a YouTube tab, runs the existing `extractCaptions` via `chrome.scripting.executeScript`, POSTs to `/api/import`, and sends the result back. The app detects the extension via a DOM marker and shows an install CTA when absent.

**Tech Stack:** Chrome MV3 (no build step, plain JS), Next.js App Router (React 19), TypeScript, vitest (node env).

**Spec:** `docs/plans/2026-06-19-in-app-import-bridge-spec.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `apps/web/lib/extension-bridge.ts` (new) | Client helper: detect extension, send import intent, await result. Pure parsing split out for tests. |
| `apps/web/lib/extension-bridge.test.ts` (new) | Unit tests for the pure message parser. |
| `apps/web/app/extension/page.tsx` (new) | Install-instructions page (the `/extension` link currently 404s). |
| `apps/web/app/import/ImportModal.tsx` (modify) | Replace the fake `setTimeout` import with the real bridge flow. |
| `extension/capture.js` (new) | Shared `extractCaptions` + `enableCaptions` (moved out of `popup.js`). |
| `extension/popup.js` (modify) | Use `capture.js` instead of the inlined copy. |
| `extension/popup.html` (modify) | Load `capture.js` before `popup.js`. |
| `extension/bridge.js` (new) | App-origin content script: set marker, relay messages both ways. |
| `extension/background.js` (new) | Service worker: orchestrate tab → capture → POST → result. |
| `extension/manifest.json` (modify) | Register `bridge.js`, `background.js`, add `tabs` permission, bump version. |

Extension files are plain JS with no test runner; they are verified at runtime in Chrome (Task 8). The only unit-tested code is the app-side `extension-bridge` parser.

---

## Task 1: App-side bridge helper (TDD)

**Files:**
- Create: `apps/web/lib/extension-bridge.ts`
- Test: `apps/web/lib/extension-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/extension-bridge.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseImportResult, EXT_SOURCE } from "./extension-bridge";

const msg = (over: Record<string, unknown> = {}) => ({
  source: EXT_SOURCE,
  type: "IMPORT_RESULT",
  videoId: "abc123",
  ok: true,
  lines: 42,
  ...over,
});

describe("parseImportResult", () => {
  test("returns a normalized result for a matching message", () => {
    expect(parseImportResult(msg(), "abc123")).toEqual({
      ok: true,
      lines: 42,
      error: undefined,
    });
  });

  test("carries the error string through when present", () => {
    expect(parseImportResult(msg({ ok: false, lines: undefined, error: "No Japanese subtitles" }), "abc123"))
      .toEqual({ ok: false, lines: undefined, error: "No Japanese subtitles" });
  });

  test("ignores messages for a different video", () => {
    expect(parseImportResult(msg({ videoId: "other" }), "abc123")).toBeNull();
  });

  test("ignores messages from a foreign source or wrong type", () => {
    expect(parseImportResult(msg({ source: "evil" }), "abc123")).toBeNull();
    expect(parseImportResult(msg({ type: "NOPE" }), "abc123")).toBeNull();
  });

  test("ignores malformed payloads", () => {
    expect(parseImportResult(null, "abc123")).toBeNull();
    expect(parseImportResult("string", "abc123")).toBeNull();
    expect(parseImportResult(42, "abc123")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fuchine/web test -- extension-bridge`
Expected: FAIL — `Failed to load url ./extension-bridge` (module missing).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/lib/extension-bridge.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fuchine/web test -- extension-bridge`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/extension-bridge.ts apps/web/lib/extension-bridge.test.ts
git commit -m "feat(web): extension bridge client helper (#8)"
```

---

## Task 2: Shared capture module in the extension

**Files:**
- Create: `extension/capture.js`
- Modify: `extension/popup.js`, `extension/popup.html`

- [ ] **Step 1: Create `extension/capture.js`**

Move the `extractCaptions` function **verbatim** from `extension/popup.js` (currently lines 19–126, the whole `async function extractCaptions() { … }`) into a new file `extension/capture.js`, then add an `enableCaptions` helper:

```js
// Shared, self-contained capture helpers. Loaded by popup.html (script tag) and
// by background.js (importScripts). Both pass these by reference to
// chrome.scripting.executeScript, which serializes the function into the page —
// so each function MUST be self-contained (no outer-scope references).

// (extractCaptions moved verbatim from popup.js — reads window.ytInitialPlayerResponse,
//  window.__fuchine, and the player API; returns { ...meta, captions } or { error }.)
async function extractCaptions() {
  /* …exact body moved from popup.js… */
}

// Best-effort: turn on the Japanese caption track so the player fetches it
// (inject.js then captures the timedtext response). Fragile by nature.
function enableCaptions() {
  try {
    const p = document.getElementById("movie_player");
    if (p && p.setOption) {
      p.setOption("captions", "track", { languageCode: "ja" });
      p.setOption("captions", "reload", true);
    } else if (p && p.loadModule) {
      p.loadModule("captions");
    }
  } catch (e) {}
  return true;
}
```

- [ ] **Step 2: Update `extension/popup.html`**

Add `capture.js` before `popup.js` so the global functions exist:

```html
<script src="capture.js"></script>
<script src="popup.js"></script>
```

(If `popup.html` already has `<script src="popup.js"></script>`, insert the `capture.js` line immediately above it.)

- [ ] **Step 3: Update `extension/popup.js`**

Delete the inlined `async function extractCaptions() { … }` (the block now living in `capture.js`). Leave the call site `func: extractCaptions` untouched — it now resolves to the global from `capture.js`.

- [ ] **Step 4: Commit**

```bash
git add extension/capture.js extension/popup.js extension/popup.html
git commit -m "refactor(ext): extract shared capture.js from popup (#8)"
```

> Verification deferred to Task 8 (load the extension, confirm the popup still imports).

---

## Task 3: Manifest — register bridge, background, tabs permission

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Edit `extension/manifest.json`**

Bump `version` to `"0.0.6"`, add `"tabs"` to `permissions`, add a `background` service worker, and add a content script on the Fuchine origin. Result:

```json
{
  "manifest_version": 3,
  "name": "Fuchine Importer",
  "version": "0.0.6",
  "description": "Import the current YouTube video (with its Japanese captions) into Fuchine.",
  "permissions": ["activeTab", "scripting", "storage", "tabs"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://*.youtube.com/*",
    "http://localhost:3000/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["inject.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["http://localhost:3000/*"],
      "js": ["bridge.js"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Import to Fuchine"
  }
}
```

> Production note: add the deployed Fuchine origin to both `host_permissions` and the `bridge.js` content-script `matches` when the instance is not localhost.

- [ ] **Step 2: Commit**

```bash
git add extension/manifest.json
git commit -m "feat(ext): register bridge content script + background worker (#8)"
```

---

## Task 4: bridge.js — app-origin marker + relay

**Files:**
- Create: `extension/bridge.js`

- [ ] **Step 1: Create `extension/bridge.js`**

```js
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
    chrome.runtime.sendMessage({ type: "IMPORT", videoId: m.videoId });
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
      },
      window.location.origin,
    );
  });
})();
```

- [ ] **Step 2: Commit**

```bash
git add extension/bridge.js
git commit -m "feat(ext): bridge.js — marker + app/background relay (#8)"
```

---

## Task 5: background.js — capture orchestrator

**Files:**
- Create: `extension/background.js`

- [ ] **Step 1: Create `extension/background.js`**

```js
// Service worker: on an IMPORT request from bridge.js, open a YouTube tab,
// enable CC, capture captions via the page's MAIN world, POST them to the
// originating Fuchine instance, then report the result back and close the tab.
importScripts("capture.js"); // defines extractCaptions, enableCaptions

const CAPTURE_WAIT_MS = 2500;

function waitForComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runInPage(tabId, func) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
  });
  return result;
}

async function doImport(videoId, base) {
  const tab = await chrome.tabs.create({
    url: `https://www.youtube.com/watch?v=${videoId}`,
  });
  try {
    await waitForComplete(tab.id);
    await runInPage(tab.id, enableCaptions);
    await sleep(CAPTURE_WAIT_MS);
    const cap = await runInPage(tab.id, extractCaptions);

    if (!cap) return { ok: false, error: "Could not read the page." };
    if (cap.error === "no-ja") return { ok: false, error: "No Japanese subtitles on this video." };
    if (cap.error === "needs-cc") return { ok: false, error: "Couldn't capture subtitles — try opening on YouTube." };
    if (cap.error) return { ok: false, error: `Capture failed: ${cap.error}` };
    if (!cap.captions || cap.captions.length === 0) return { ok: false, error: "No subtitle lines found." };

    const res = await fetch(`${base}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(cap),
    });
    if (res.status === 401) return { ok: false, error: "Sign in to Fuchine first, then retry." };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Import failed (${res.status}): ${body.error || ""}` };
    return { ok: true, lines: body.lines };
  } finally {
    if (tab.id != null) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "IMPORT" || typeof msg.videoId !== "string") return;
  const appTabId = sender.tab && sender.tab.id;
  const base = sender.url ? new URL(sender.url).origin : "http://localhost:3000";
  if (appTabId == null) return;

  doImport(msg.videoId, base)
    .catch((err) => ({ ok: false, error: String((err && err.message) || err) }))
    .then((result) => {
      chrome.tabs.sendMessage(appTabId, {
        type: "IMPORT_RESULT",
        videoId: msg.videoId,
        ...result,
      });
    });
  // No async response needed on this channel; result is delivered via sendMessage.
});
```

- [ ] **Step 2: Commit**

```bash
git add extension/background.js
git commit -m "feat(ext): background.js capture orchestrator (#8)"
```

> Verification deferred to Task 8.

---

## Task 6: /extension install page

**Files:**
- Create: `apps/web/app/extension/page.tsx`

- [ ] **Step 1: Create `apps/web/app/extension/page.tsx`**

```tsx
export const metadata = { title: "Install the Fuchine extension" };

export default function ExtensionPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1>Install the Fuchine importer</h1>
      <p>
        YouTube only serves subtitles to a signed-in browser session, so Fuchine
        captures them through a small browser extension. Install it once, then
        import any video straight from the app.
      </p>
      <ol>
        <li>Open <code>chrome://extensions</code> and enable <strong>Developer mode</strong>.</li>
        <li>Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder.</li>
        <li>Sign in to Fuchine, then paste a YouTube link on the Import page and click <strong>Import</strong>.</li>
      </ol>
      <p>
        The extension opens the video on YouTube, captures its Japanese
        subtitles, and sends them back to Fuchine automatically.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm --filter @fuchine/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/extension/page.tsx
git commit -m "feat(web): /extension install instructions page (#8)"
```

---

## Task 7: Wire the real import flow into ImportModal

**Files:**
- Modify: `apps/web/app/import/ImportModal.tsx`

- [ ] **Step 1: Import the bridge helper**

At the top of `apps/web/app/import/ImportModal.tsx`, add:

```tsx
import { isExtensionInstalled, requestImport } from "@/lib/extension-bridge";
```

- [ ] **Step 2: Replace the fake `handleStartStudy`**

Replace the existing `handleStartStudy` (the one using `setTimeout(() => go("done"), 2500)`) with the real flow:

```tsx
async function handleStartStudy() {
  if (importedVideoId) {
    router.push(`/videos/${importedVideoId}`);
    return;
  }
  if (!video) return;

  if (!isExtensionInstalled()) {
    setErrorMsg("The Fuchine extension isn't installed.");
    go("failed");
    return;
  }

  go("processing");
  const result = await requestImport(video.id);
  if (result.ok) {
    setImportedVideoId(video.id);
    go("done");
  } else {
    setErrorMsg(result.error ?? "Import failed.");
    go("failed");
  }
}
```

- [ ] **Step 3: Make the `valid` state branch on extension presence**

In `ValidPreview`, when the extension is **not** installed, the primary button should send the user to `/extension` instead of importing. Pass a flag and render accordingly. In the parent, compute once:

```tsx
const extReady = typeof window !== "undefined" && isExtensionInstalled();
```

Pass `extReady` to `ValidPreview` and switch the footer button:

```tsx
{extReady ? (
  <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} onClick={onStartStudy}>
    <PlayIcon /> Import &amp; study
  </button>
) : (
  <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/extension" target="_blank" rel="noopener noreferrer">
    <DownloadIcon /> Install the extension
  </a>
)}
```

(Keep the existing `extensionNote` block as secondary guidance.)

- [ ] **Step 4: Let `Failed` retry through the real flow**

The existing `Failed` component already calls `onRetry={handleStartStudy}` — no change needed; confirm it still compiles.

- [ ] **Step 5: Verify it builds**

Run: `pnpm --filter @fuchine/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/import/ImportModal.tsx
git commit -m "feat(web): real import flow via extension bridge (#8)"
```

---

## Task 8: Runtime verification (real Chrome)

**Files:** none (verification only)

- [ ] **Step 1: Start the app**

Run: `pnpm dev` (Postgres + Redis up via `docker compose up -d`). Sign in at `http://localhost:3000`.

- [ ] **Step 2: Load the extension**

`chrome://extensions` → Developer mode → Load unpacked → select `extension/`. Confirm it loads at version 0.0.6 with no service-worker errors.

- [ ] **Step 3: Confirm detection**

On `http://localhost:3000/import`, open DevTools console and run:
`document.documentElement.dataset.fuchineExt`
Expected: `"0.0.6"`.

- [ ] **Step 4: Drive the import**

Paste a YouTube URL with Japanese subtitles, click **Import & study**. Expected: a YouTube tab opens, CC turns on, the tab closes, the modal advances to **Ready!**, and **Start studying** navigates to `/videos/:id` with subtitles present.

- [ ] **Step 5: Probe the negative paths**
  - 🔍 Uninstall/disable the extension → reload `/import` → the `valid` state shows **Install the extension** linking to `/extension` (which renders the instructions).
  - 🔍 Import a video with **no** Japanese subtitles → modal reaches **failed** with "No Japanese subtitles on this video."

- [ ] **Step 6: Capture evidence**

Screenshot the player after a successful in-app import and the `failed` state for the no-subs case. Record what you observed in the PR description.

---

## Self-review notes

- **Spec coverage:** detection (T3/T4), app→ext relay (T1/T4), capture+POST (T5 reuses `extractCaptions`), ext→app result (T4/T5), no-extension CTA + `/extension` page (T6/T7), real modal states (T7), error paths (T5/T7/T8). All spec sections map to a task.
- **Type/contract consistency:** message shapes (`source`/`type`/`videoId`/`ok`/`lines`/`error`) match across `extension-bridge.ts`, `bridge.js`, and `background.js`. The DOM marker key `fuchineExt` (→ `data-fuchine-ext`) is identical in `bridge.js` and `extension-bridge.ts`.
- **Out of scope (unchanged):** hidden-tab capture, production auth hardening, WXT migration, server-side caption fetch.
