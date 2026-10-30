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
        <li>
          Get the extension: download the <code>fuchine-importer-*-chrome.zip</code> from the
          project&apos;s GitHub releases and unzip it, or build it from source with{" "}
          <code>cd extension &amp;&amp; npm ci &amp;&amp; npm run build</code>.
        </li>
        <li>Open <code>chrome://extensions</code> and enable <strong>Developer mode</strong>.</li>
        <li>
          Click <strong>Load unpacked</strong> and select the unzipped folder (or{" "}
          <code>extension/.output/chrome-mv3</code> when built from source).
        </li>
        <li>In the extension popup, set <strong>Fuchine URL</strong> to this instance&apos;s address.</li>
        <li>Sign in to Fuchine, then paste a YouTube link on the Import page and click <strong>Import</strong>.</li>
      </ol>
      <p>
        The extension opens the video on YouTube, captures its Japanese
        subtitles, and sends them back to Fuchine automatically.
      </p>
    </main>
  );
}
