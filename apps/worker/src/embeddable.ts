// Embed-blocked detection (backlog: embed-blocked-videos). YouTube's public
// oEmbed endpoint needs no API key and answers 401/403 for videos whose owner
// disabled embedded playback (the IFrame API's error 150/101). We record that
// at import so the library can warn before the user opens a dead player.

/**
 * Returns true if the video is embeddable, false if the owner blocked embeds,
 * or null when it can't be determined (network error, unexpected status) — in
 * which case the caller leaves the flag unset rather than guessing.
 */
export async function checkEmbeddable(sourceId: string): Promise<boolean | null> {
  const watch = `https://www.youtube.com/watch?v=${sourceId}`;
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) return true;
    // 401/403 = embedding disabled. Other codes (404 removed/private) are
    // inconclusive for embeddability, so don't mark the video.
    if (res.status === 401 || res.status === 403) return false;
    return null;
  } catch {
    return null;
  }
}
