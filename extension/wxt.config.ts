import { defineConfig } from "wxt";

// Manifest fields that aren't derived from entrypoints. `version` comes from
// package.json; content scripts, background and popup come from entrypoints/.
export default defineConfig({
  manifestVersion: 3,
  // Chrome only for now (the Web Store target). `wxt zip` → .output/*-chrome.zip
  browser: "chrome",
  // Ship readable code: easier Web Store review, and the functions passed to
  // scripting.executeScript (lib/capture.ts) are serialized as-is.
  vite: () => ({ build: { minify: false } }),
  manifest: {
    // Trademark-safe: no "YouTube" in the name (Web Store has removed
    // extensions that use it). See docs/PESQUISA_MERCADO-2026-10-29.md §6.
    name: "Fuchine Importer",
    description:
      "Send the video you're watching, with its Japanese captions, to your Fuchine instance to study it.",
    minimum_chrome_version: "111", // content_scripts world: "MAIN"
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: [
      "https://www.youtube.com/*",
      "https://*.youtube.com/*",
      "http://localhost:3000/*",
    ],
    // A self-hosted Fuchine instance can live on any https origin, and match
    // patterns can't express "the user's instance" more narrowly. The pattern
    // is optional: nothing is granted at install, and the popup requests only
    // the single configured origin (`https://<instance>/*`) at import time.
    optional_host_permissions: ["https://*/*"],
  },
});
