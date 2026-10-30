// Shared pieces of the server-side list queries (library/phrases): the keyset
// cursor for non-default sorts, and LIKE-pattern escaping for search. The
// default created_at sorts keep the legacy "t:<ts>:<id>" cursor format; other
// sorts carry the last row's sort value + id, base64url-encoded so free text
// (titles, phrases) survives the URL round-trip.

export type CursorPart = string | number | null;

export function encodeListCursor(parts: CursorPart[]): string {
  return "k:" + Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

/** Returns null for anything that isn't a well-formed "k:" cursor. */
export function decodeListCursor(cursor: string): CursorPart[] | null {
  if (!cursor.startsWith("k:")) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor.slice(2), "base64url").toString("utf8"),
    );
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((p) => p === null || typeof p === "string" || typeof p === "number")) {
      return null;
    }
    return parsed as CursorPart[];
  } catch {
    return null;
  }
}

/**
 * Page size from a `?limit=` param: an integer in [1, max], `fallback` when the
 * param is absent or not a number (NaN/negative used to reach SQL LIMIT → 500).
 */
export function parseLimit(raw: string | null, fallback: number, max = 100): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}

/** Escape %, _ and \ so user input matches literally inside an ILIKE pattern. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}
