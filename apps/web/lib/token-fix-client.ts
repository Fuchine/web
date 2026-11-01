// Browser side of the per-user token correction (T3.7): the player and the
// curation screen call PUT/DELETE /api/lines/:id/tokens through these. Errors
// the server wrote for the user (400s: "the line text cannot change", partial
// overlap) surface as UserFacingError so the editor shows them as is.

import { UserFacingError, type FixEntryHit, type TokenFixOverride } from "@fuchine/ui";
import type { Definition, Token } from "@fuchine/db";
import type { TokenSpan } from "@fuchine/core";
import type { WordEntryData } from "./cards";

export type LineTokensResponse = {
  lineId: string;
  tokens: Token[];
  tokenSpans: TokenSpan[] | null;
  wordEntries: Record<string, WordEntryData>;
};

async function send(lineId: string, method: "PUT" | "DELETE", body: unknown): Promise<LineTokensResponse> {
  const res = await fetch(`/api/lines/${lineId}/tokens`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<LineTokensResponse> & { error?: string };
  if (!res.ok) {
    if ((res.status === 400 || res.status === 429) && data.error) throw new UserFacingError(data.error);
    throw new Error(`token correction failed: ${res.status}`);
  }
  return data as LineTokensResponse;
}

export function saveLineTokens(lineId: string, override: TokenFixOverride) {
  return send(lineId, "PUT", override);
}

export function resetLineTokens(lineId: string, span: { startIdx: number; endIdx: number } | null) {
  return send(lineId, "DELETE", span ?? {});
}

/** Dictionary search for the editor's entry picker (GET /api/dictionary?q=). */
export async function searchEntries(q: string): Promise<FixEntryHit[]> {
  const res = await fetch(`/api/dictionary?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const data = (await res.json()) as {
    entries?: { id: string; lemma: string; reading: string | null; definitions: Definition[] }[];
  };
  return (data.entries ?? []).slice(0, 12).map((e) => ({
    id: e.id,
    lemma: e.lemma,
    reading: e.reading,
    gloss: e.definitions[0]?.glosses.slice(0, 2).join("; ") ?? "",
  }));
}
