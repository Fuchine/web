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
