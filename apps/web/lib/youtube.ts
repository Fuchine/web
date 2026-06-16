// Extract the YouTube video id from a URL or a bare 11-char id.
// Returns null when the input isn't a recognizable YouTube reference.
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/) ||
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}
