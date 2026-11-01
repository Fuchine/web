// Curation screen helpers (T3.6). Pure and client-safe (no DB imports): the
// server side lives in lib/phrases.ts (listUncuratedCards).

/**
 * Group cards by video, keeping the incoming (newest-first) order: groups are
 * ordered by their newest card, cards inside a group keep their order. Cards
 * of a video that arrive on a later page join the existing group.
 */
export function groupByVideo<T extends { videoId: string }>(items: T[]): { videoId: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const g = groups.get(item.videoId);
    if (g) g.push(item);
    else groups.set(item.videoId, [item]);
  }
  return [...groups].map(([videoId, list]) => ({ videoId, items: list }));
}

/**
 * The card to focus after `removedId` leaves the list (curated or deleted):
 * the next one in display order, else the previous, else null.
 */
export function nextActiveAfter(orderedIds: string[], removedId: string): string | null {
  const i = orderedIds.indexOf(removedId);
  if (i < 0) return orderedIds[0] ?? null;
  return orderedIds[i + 1] ?? orderedIds[i - 1] ?? null;
}

/**
 * The notes value "Done" persists. Whitespace-only becomes "" — the explicit
 * "curated, no notes" sentinel (NULL means "not curated yet").
 */
export function curatedNotes(draft: string): string {
  return draft.trim() === "" ? "" : draft;
}
