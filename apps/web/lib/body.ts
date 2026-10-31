// Read a request body into memory with a hard byte cap (T3.4 admin upload).
// Content-Length is checked first, then the stream is counted as it arrives,
// so a lying or missing header cannot push past the cap.

export async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array | "too_large" | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return "too_large";
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
